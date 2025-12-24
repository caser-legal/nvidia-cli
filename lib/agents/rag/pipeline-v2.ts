/**
 * RAG Pipeline v2
 * Full implementation based on NVIDIA RAG Blueprint (Dec 2025)
 */

import { Document, SearchResult } from './types';
import { NVIDIAEmbeddings, NVIDIAReranker, SimpleVectorStore } from './embeddings';
import { QueryDecomposer } from './query-decomposition';
import { ReflectionSystem, ReflectionCounter } from './reflection';
import { ResearchWorkflow, ResearchResult } from './research-workflow';
import { RecursiveCharacterTextSplitter, SwiftTextSplitter } from './text-splitter';
import { ContextualCompressionRetriever, AgentControlledRetriever } from './contextual-retriever';
import { RAGProfile, IOS_DEVELOPMENT_PROFILE, getRAGProfile, ChunkingConfig, RetrievalConfig, ModelConfig } from './config';
import { createLogger } from '../../logger';

const log = createLogger("RAGv2");

export interface RAGPipelineV2Config {
  profile?: string | RAGProfile;
  chunking?: Partial<ChunkingConfig>;
  retrieval?: Partial<RetrievalConfig>;
  models?: Partial<ModelConfig>;
}

export class RAGPipelineV2 {
  private profile: RAGProfile;
  private embeddings: NVIDIAEmbeddings;
  private reranker: NVIDIAReranker;
  private vectorStore: SimpleVectorStore;
  private retriever: ContextualCompressionRetriever;
  private agentRetriever: AgentControlledRetriever;
  private textSplitter: RecursiveCharacterTextSplitter;
  private decomposer: QueryDecomposer;
  private reflection: ReflectionSystem;
  private llmEndpoint: string;
  private initialized: boolean = false;

  constructor(config: RAGPipelineV2Config = {}) {
    if (typeof config.profile === 'string') {
      this.profile = getRAGProfile(config.profile);
    } else if (config.profile) {
      this.profile = config.profile;
    } else {
      this.profile = IOS_DEVELOPMENT_PROFILE;
    }

    if (config.chunking) this.profile.chunking = { ...this.profile.chunking, ...config.chunking };
    if (config.retrieval) this.profile.retrieval = { ...this.profile.retrieval, ...config.retrieval };
    if (config.models) this.profile.models = { ...this.profile.models, ...config.models };

    this.llmEndpoint = 'https://integrate.api.nvidia.com/v1';

    this.embeddings = new NVIDIAEmbeddings({ provider: 'nvidia', model: this.profile.models.embeddingModel });
    this.reranker = new NVIDIAReranker(this.profile.models.rerankModel, this.profile.retrieval.rerankTopK);
    this.vectorStore = new SimpleVectorStore(this.embeddings);
    this.retriever = new ContextualCompressionRetriever(this.vectorStore, this.reranker, this.profile.retrieval);
    this.agentRetriever = new AgentControlledRetriever(this.retriever);
    this.textSplitter = new SwiftTextSplitter(this.profile.chunking);
    this.decomposer = new QueryDecomposer(this.llmEndpoint, this.profile.models.llmModel);
    this.reflection = new ReflectionSystem(this.llmEndpoint, this.profile.models.llmModel, 1, 1);

    this.init();

    log.info(`Initialized with profile: ${this.profile.name}`, {
      chunkSize: this.profile.chunking.chunkSize,
      chunkOverlap: this.profile.chunking.chunkOverlap,
      initialTopK: this.profile.retrieval.initialTopK,
      rerankTopK: this.profile.retrieval.rerankTopK,
    });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    await this.vectorStore.loadFromDisk();
    this.initialized = true;
  }

  async ingest(documents: { id: string; content: string; metadata?: Record<string, unknown> }[]): Promise<{ chunksCreated: number; documentsProcessed: number }> {
    await this.init();
    log.info(`Ingesting ${documents.length} documents`);

    const chunkedDocs = this.textSplitter.splitDocuments(documents);
    log.info(`Created ${chunkedDocs.length} chunks from ${documents.length} documents`);

    await this.vectorStore.addDocuments(chunkedDocs);
    this.retriever.addToBM25(chunkedDocs);
    log.debug(`Added ${chunkedDocs.length} chunks to BM25 index`);

    return { chunksCreated: chunkedDocs.length, documentsProcessed: documents.length };
  }

  async ingestDirectory(dirPath: string, options: { extensions?: string[]; recursive?: boolean; excludePatterns?: string[] } = {}): Promise<{ chunksCreated: number; filesProcessed: number }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const { extensions = ['.swift', '.ts', '.tsx', '.js', '.jsx', '.md', '.txt'], recursive = true, excludePatterns = ['node_modules', '.git', 'build', 'dist', '.next'] } = options;
    const documents: { id: string; content: string; metadata?: Record<string, unknown> }[] = [];

    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (excludePatterns.some(p => fullPath.includes(p))) continue;

        if (entry.isDirectory() && recursive) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              documents.push({ id: fullPath, content, metadata: { source: fullPath, filename: entry.name, extension: ext, directory: dir } });
            } catch (error) {
              log.warn(`Failed to read ${fullPath}`, { error: String(error) });
            }
          }
        }
      }
    }

    await walkDir(dirPath);
    const result = await this.ingest(documents);
    return { chunksCreated: result.chunksCreated, filesProcessed: documents.length };
  }

  async search(query: string): Promise<SearchResult> {
    await this.init();

    let queries = [query];
    if (this.profile.retrieval.enableDecomposition) {
      try {
        const decomposed = await this.decomposer.decompose(query);
        if (decomposed.needsDecomposition) {
          queries = decomposed.subQueries.map(sq => sq.query);
          log.debug(`Decomposed into ${queries.length} sub-queries`);
        }
      } catch (error) {
        log.warn('Query decomposition failed', { error: String(error) });
      }
    }

    let result = queries.length > 1 
      ? await this.retriever.retrieveWithDecomposition(query, queries.slice(1))
      : await this.retriever.retrieve(query);

    const finalDocs = result.documents;
    if (this.profile.retrieval.enableReflection && finalDocs.length > 0) {
      const reflectionCounter = new ReflectionCounter(this.profile.retrieval.maxReflectionLoops);

      while (reflectionCounter.remaining > 0) {
        const relevanceResult = await this.reflection.checkContextRelevance(query, finalDocs);
        if (relevanceResult.isRelevant) break;

        const rewrittenQuery = await this.reflection.rewriteQueryForRelevance(query, finalDocs);
        if (rewrittenQuery === query) break;

        log.debug(`Reflection: rewriting query to "${rewrittenQuery.slice(0, 50)}..."`);
        const newResult = await this.retriever.retrieve(rewrittenQuery);

        if (newResult.documents.length > 0) {
          const seenIds = new Set(finalDocs.map(d => d.id));
          for (const doc of newResult.documents) {
            if (!seenIds.has(doc.id)) {
              finalDocs.push(doc);
              seenIds.add(doc.id);
            }
          }
        }
        reflectionCounter.increment();
      }
    }

    return { documents: finalDocs, query, reranked: result.reranked, totalFound: finalDocs.length };
  }

  getAgentRetriever(): AgentControlledRetriever {
    return this.agentRetriever;
  }

  async generate(query: string, systemPrompt?: string): Promise<{ answer: string; sources: Document[] }> {
    const searchResult = await this.search(query);

    if (searchResult.documents.length === 0) {
      return { answer: "I couldn't find relevant information to answer your question.", sources: [] };
    }

    const context = searchResult.documents.map((d, i) => `[${i + 1}] ${d.content}`).join('\n\n');
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return { answer: "API key not configured for response generation.", sources: searchResult.documents };

    const prompt = `Based on the following context, answer the question. Cite sources using [1], [2], etc.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.profile.models.llmModel,
          messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

      const data = await response.json();
      let answer = data.choices[0]?.message?.content?.trim() || '';

      if (this.profile.retrieval.enableReflection) {
        const groundednessResult = await this.reflection.checkResponseGroundedness(answer, searchResult.documents);
        if (!groundednessResult.isGrounded) {
          const regenerated = await this.reflection.regenerateResponse(query, searchResult.documents, answer);
          if (regenerated && !regenerated.includes('OUT OF CONTEXT')) answer = regenerated;
        }
      }

      return { answer, sources: searchResult.documents };
    } catch (error) {
      log.error('Response generation failed', { error: String(error) });
      return { answer: "Failed to generate response.", sources: searchResult.documents };
    }
  }

  async research(topic: string, externalSearchFn?: (query: string) => Promise<Document[]>): Promise<ResearchResult> {
    const workflow = new ResearchWorkflow({ maxReflections: this.profile.retrieval.maxReflectionLoops, searchWeb: !!externalSearchFn, numQueries: 5 }, this.llmEndpoint, this.profile.models.llmModel);

    const searchFn = async (query: string): Promise<Document[]> => {
      const localResults = await this.search(query);
      const localDocs = localResults.documents;

      if (externalSearchFn) {
        const externalDocs = await externalSearchFn(query);
        const seenIds = new Set(localDocs.map(d => d.id));
        const merged = [...localDocs];
        for (const doc of externalDocs) {
          if (!seenIds.has(doc.id)) merged.push(doc);
        }
        return merged;
      }
      return localDocs;
    };

    return workflow.run(topic, searchFn);
  }

  getDocumentCount(): number { return this.vectorStore.getDocumentCount(); }
  clear(): void { this.vectorStore.clear(); }
  async validate(): Promise<{ removed: number; total: number }> { return this.vectorStore.validateDocuments(); }
  async update(sourcePath: string): Promise<{ updated: number; removed: number }> { return this.vectorStore.updateDocuments(sourcePath); }
  getSourceFiles(): string[] { return this.vectorStore.getSourceFiles(); }
  getProfile(): RAGProfile { return { ...this.profile }; }

  getStats(): { profile: string; documentCount: number; chunkSize: number; chunkOverlap: number; initialTopK: number; rerankTopK: number } {
    return {
      profile: this.profile.name,
      documentCount: this.vectorStore.getDocumentCount(),
      chunkSize: this.profile.chunking.chunkSize,
      chunkOverlap: this.profile.chunking.chunkOverlap,
      initialTopK: this.profile.retrieval.initialTopK,
      rerankTopK: this.profile.retrieval.rerankTopK,
    };
  }
}

let defaultPipeline: RAGPipelineV2 | null = null;

export function getRAGPipeline(config?: RAGPipelineV2Config): RAGPipelineV2 {
  if (!defaultPipeline) defaultPipeline = new RAGPipelineV2(config);
  return defaultPipeline;
}

export function resetRAGPipeline(): void {
  defaultPipeline = null;
}
