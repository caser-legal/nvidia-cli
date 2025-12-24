/**
 * RAG Pipeline
 * Combines all RAG components into a unified pipeline
 * Based on NVIDIA RAG Blueprint patterns
 */

import { Document, SearchResult } from './types';
import { NVIDIAEmbeddings, NVIDIAReranker, SimpleVectorStore } from './embeddings';
import { QueryDecomposer } from './query-decomposition';
import { ReflectionSystem, ReflectionCounter } from './reflection';
import { ResearchWorkflow, ResearchResult } from './research-workflow';

export interface RAGPipelineConfig {
  // Embedding config
  embeddingModel?: string;
  
  // Reranking config
  rerankModel?: string;
  rerankTopN?: number;
  
  // Retrieval config
  topK?: number;
  scoreThreshold?: number;
  
  // Reflection config
  enableReflection?: boolean;
  maxReflectionLoops?: number;
  relevanceThreshold?: number;
  groundednessThreshold?: number;
  
  // Query decomposition
  enableDecomposition?: boolean;
  
  // LLM config
  llmModel?: string;
}

const DEFAULT_CONFIG: RAGPipelineConfig = {
  embeddingModel: 'nvidia/llama-3.2-nv-embedqa-1b-v2',
  rerankModel: 'nvidia/llama-3.2-nv-rerankqa-1b-v2',
  rerankTopN: 15,
  topK: 30,
  scoreThreshold: 0.0,  // No threshold - let reranker handle relevance filtering
  enableReflection: true,
  maxReflectionLoops: 3,
  relevanceThreshold: 1,
  groundednessThreshold: 1,
  enableDecomposition: true,
  llmModel: 'nvidia/nemotron-3-nano-30b-a3b',  // Nemotron 3 Nano for RAG generation
};

export class RAGPipeline {
  private config: RAGPipelineConfig;
  private embeddings: NVIDIAEmbeddings;
  private reranker: NVIDIAReranker;
  private vectorStore: SimpleVectorStore;
  private decomposer: QueryDecomposer;
  private reflection: ReflectionSystem;
  private llmEndpoint: string;
  private initialized: boolean = false;

  constructor(config: Partial<RAGPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llmEndpoint = 'https://integrate.api.nvidia.com/v1';

    // Initialize components
    this.embeddings = new NVIDIAEmbeddings({
      provider: 'nvidia',
      model: this.config.embeddingModel!,
    });

    this.reranker = new NVIDIAReranker(
      this.config.rerankModel,
      this.config.rerankTopN
    );

    this.vectorStore = new SimpleVectorStore(this.embeddings);

    this.decomposer = new QueryDecomposer(
      this.llmEndpoint,
      this.config.llmModel
    );

    this.reflection = new ReflectionSystem(
      this.llmEndpoint,
      this.config.llmModel,
      this.config.relevanceThreshold,
      this.config.groundednessThreshold
    );
    
    // Note: init() is called lazily on first operation, not in constructor
  }

  private initPromise: Promise<void> | null = null;
  
  private async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.vectorStore.loadFromDisk().then(() => {
        this.initialized = true;
      });
    }
    await this.initPromise;
  }

  /**
   * Ingest documents into the vector store
   */
  async ingest(documents: { id: string; content: string; metadata?: Record<string, unknown> }[]): Promise<void> {
    await this.init();
    // Chunk documents if needed
    const chunkedDocs = this.chunkDocuments(documents);
    await this.vectorStore.addDocuments(chunkedDocs);
  }

  /**
   * Search for relevant documents
   */
  async search(query: string): Promise<SearchResult> {
    await this.init();
    // Step 1: Query decomposition (optional)
    let queries = [query];
    if (this.config.enableDecomposition) {
      try {
        const decomposed = await this.decomposer.decompose(query);
        if (decomposed.needsDecomposition) {
          queries = decomposed.subQueries.map(sq => sq.query);
        }
      } catch (error) {
        console.warn('[RAG] Query decomposition failed, using original query:', error);
      }
    }

    // Step 2: Retrieve documents for each query
    const allDocs: Document[] = [];
    for (const q of queries) {
      const results = await this.vectorStore.search(q, this.config.topK!);
      for (const r of results) {
        if (r.score >= this.config.scoreThreshold!) {
          allDocs.push({
            id: r.id,
            content: r.content,
            metadata: {
              ...r.metadata,
              source: r.metadata.source as string || 'local',
              relevanceScore: r.score,
            },
          });
        }
      }
    }

    // Step 2.5: Fallback to text search if vector search returns no results
    if (allDocs.length === 0) {
      console.log('[RAG] Vector search returned no results, trying text search fallback');
      const textResults = await this.vectorStore.textSearch(query, this.config.topK!);
      for (const r of textResults) {
        allDocs.push({
          id: r.id,
          content: r.content,
          metadata: {
            ...r.metadata,
            source: r.metadata.source as string || 'local',
            relevanceScore: r.score,
            searchType: 'text',
          },
        });
      }
    }

    // Step 3: Deduplicate
    const uniqueDocs = this.deduplicateDocuments(allDocs);

    // Step 4: Rerank
    let reranked = false;
    let finalDocs = uniqueDocs;
    
    if (uniqueDocs.length > 0) {
      try {
        const rerankedResults = await this.reranker.rerank(
          query,
          uniqueDocs.map(d => ({ content: d.content, metadata: d.metadata }))
        );
        
        finalDocs = rerankedResults.map(r => ({
          id: uniqueDocs[r.index].id,
          content: r.content,
          metadata: {
            ...uniqueDocs[r.index].metadata,
            relevanceScore: r.score,
          },
        }));
        reranked = true;
      } catch (error) {
        console.error('Reranking failed, using original order:', error);
      }
    }

    // Step 5: Reflection (optional)
    if (this.config.enableReflection && finalDocs.length > 0) {
      const reflectionCounter = new ReflectionCounter(this.config.maxReflectionLoops);
      
      while (reflectionCounter.remaining > 0) {
        const relevanceResult = await this.reflection.checkContextRelevance(query, finalDocs);
        
        if (relevanceResult.isRelevant) {
          break;
        }

        // Rewrite query and search again
        const rewrittenQuery = await this.reflection.rewriteQueryForRelevance(query, finalDocs);
        if (rewrittenQuery === query) {
          break; // No improvement possible
        }

        const newResults = await this.vectorStore.search(rewrittenQuery, this.config.topK!);
        const newDocs = newResults
          .filter(r => r.score >= this.config.scoreThreshold!)
          .map(r => ({
            id: r.id,
            content: r.content,
            metadata: {
              ...r.metadata,
              source: r.metadata.source as string || 'local',
              relevanceScore: r.score,
            },
          }));

        if (newDocs.length > 0) {
          finalDocs = this.deduplicateDocuments([...finalDocs, ...newDocs]);
        }

        reflectionCounter.increment();
      }
    }

    return {
      documents: finalDocs,
      query,
      reranked,
      totalFound: finalDocs.length,
    };
  }

  /**
   * Generate a response using RAG
   */
  async generate(query: string, systemPrompt?: string): Promise<{ answer: string; sources: Document[] }> {
    // Search for relevant documents
    const searchResult = await this.search(query);
    
    if (searchResult.documents.length === 0) {
      return {
        answer: "I couldn't find relevant information to answer your question.",
        sources: [],
      };
    }

    // Build context
    const context = searchResult.documents
      .map((d, i) => `[${i + 1}] ${d.content}`)
      .join('\n\n');

    // Generate response
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return {
        answer: "API key not configured for response generation.",
        sources: searchResult.documents,
      };
    }

    const prompt = `Based on the following context, answer the question. Cite sources using [1], [2], etc.

Context:
${context}

Question: ${query}

Answer:`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,  // Increased for longer, more detailed responses
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      let answer = data.choices[0]?.message?.content?.trim() || '';

      // Check groundedness if reflection is enabled
      if (this.config.enableReflection) {
        const groundednessResult = await this.reflection.checkResponseGroundedness(
          answer,
          searchResult.documents
        );

        if (!groundednessResult.isGrounded) {
          const regenerated = await this.reflection.regenerateResponse(
            query,
            searchResult.documents,
            answer
          );
          if (regenerated && !regenerated.includes('OUT OF CONTEXT')) {
            answer = regenerated;
          }
        }
      }

      return {
        answer,
        sources: searchResult.documents,
      };
    } catch (error) {
      console.error('Response generation failed:', error);
      return {
        answer: "Failed to generate response.",
        sources: searchResult.documents,
      };
    }
  }

  /**
   * Run a full research workflow
   */
  async research(topic: string, externalSearchFn?: (query: string) => Promise<Document[]>): Promise<ResearchResult> {
    const workflow = new ResearchWorkflow(
      {
        maxReflections: this.config.maxReflectionLoops || 2,
        searchWeb: !!externalSearchFn,
        numQueries: 5,
      },
      this.llmEndpoint,
      this.config.llmModel
    );

    // Combine local and external search
    const searchFn = async (query: string): Promise<Document[]> => {
      const localResults = await this.search(query);
      const localDocs = localResults.documents;

      if (externalSearchFn) {
        const externalDocs = await externalSearchFn(query);
        return this.deduplicateDocuments([...localDocs, ...externalDocs]);
      }

      return localDocs;
    };

    return workflow.run(topic, searchFn);
  }

  /**
   * Get document count in vector store
   */
  getDocumentCount(): number {
    return this.vectorStore.getDocumentCount();
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.vectorStore.clear();
  }

  /**
   * Validate documents - remove stale entries where source files no longer exist
   * Based on NVIDIA RAG Blueprint document management
   */
  async validate(): Promise<{ removed: number; total: number }> {
    return this.vectorStore.validateDocuments();
  }

  /**
   * Update documents from a path - removes old and prepares for re-ingestion
   * Based on NVIDIA RAG Blueprint update_documents pattern
   */
  async update(sourcePath: string): Promise<{ updated: number; removed: number }> {
    return this.vectorStore.updateDocuments(sourcePath);
  }

  /**
   * Get list of all source files in the store
   */
  getSourceFiles(): string[] {
    return this.vectorStore.getSourceFiles();
  }

  private chunkDocuments(
    documents: { id: string; content: string; metadata?: Record<string, unknown> }[],
    chunkSize: number = 6000,   // ~1500 tokens, model supports 8192 - leave room for overlap
    chunkOverlap: number = 500  // Increased overlap for better context continuity
  ): { id: string; content: string; metadata?: Record<string, unknown> }[] {
    const chunked: { id: string; content: string; metadata?: Record<string, unknown> }[] = [];

    for (const doc of documents) {
      // Skip invalid documents (null, undefined, or missing required fields)
      if (!doc || typeof doc !== 'object') {
        console.warn(`[RAG] Skipping invalid document entry - not an object`);
        continue;
      }
      
      if (!doc.id) {
        console.warn(`[RAG] Skipping document with missing ID`);
        continue;
      }
      
      const content = doc.content;
      
      // Skip documents with no content
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.warn(`[RAG] Skipping document ${doc.id} - no content`);
        continue;
      }
      
      console.log(`[RAG] Chunking document ${doc.id} (${content.length} chars)`);
      
      if (content.length <= chunkSize) {
        chunked.push(doc);
        continue;
      }

      // Split into chunks with proper termination
      const chunks: string[] = [];
      let start = 0;
      
      while (start < content.length) {
        const end = Math.min(start + chunkSize, content.length);
        chunks.push(content.slice(start, end));
        
        // Break if we've reached the end of content
        if (end >= content.length) {
          break;
        }
        
        // Move start forward, ensuring we always make progress
        start = end - chunkOverlap;
      }

      console.log(`[RAG] Created ${chunks.length} chunks for ${doc.id}`);

      // Create chunk documents
      chunks.forEach((chunk, idx) => {
        chunked.push({
          id: `${doc.id}_chunk_${idx}`,
          content: chunk,
          metadata: {
            ...doc.metadata,
            chunkIndex: idx,
            totalChunks: chunks.length,
            originalId: doc.id,
          },
        });
      });
    }

    console.log(`[RAG] Total chunks to embed: ${chunked.length}`);
    return chunked;
  }

  private deduplicateDocuments(documents: Document[]): Document[] {
    const seen = new Set<string>();
    const unique: Document[] = [];

    for (const doc of documents) {
      // Use content hash for deduplication
      const hash = this.hashContent(doc.content);
      if (!seen.has(hash)) {
        seen.add(hash);
        unique.push(doc);
      }
    }

    return unique;
  }

  private hashContent(content: string): string {
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// Export all components
export * from './types';
export * from './embeddings';
export * from './query-decomposition';
export * from './reflection';
export * from './research-workflow';
