/**
 * Contextual Compression Retriever
 * Based on NVIDIA RAG Blueprint and LangChain's ContextualCompressionRetriever
 */

import { Document } from './types';
import { NVIDIAReranker, SimpleVectorStore } from './embeddings';
import { HybridRetriever, BM25Retriever } from './hybrid-retriever';
import { RetrievalConfig, DEFAULT_RETRIEVAL_CONFIG } from './config';
import { createLogger } from '../../logger';

const log = createLogger("Retriever");

export interface RetrievalResult {
  documents: Document[];
  query: string;
  originalCount: number;
  rerankedCount: number;
  reranked: boolean;
  searchTimeMs: number;
  rerankTimeMs: number;
  hybridSources?: { bm25: number; vector: number; both: number };
}

export class ContextualCompressionRetriever {
  private vectorStore: SimpleVectorStore;
  private reranker: NVIDIAReranker;
  private config: RetrievalConfig;
  private hybridRetriever: HybridRetriever | null = null;
  private bm25: BM25Retriever;
  private useHybrid: boolean;

  constructor(vectorStore: SimpleVectorStore, reranker: NVIDIAReranker, config: Partial<RetrievalConfig> = {}, useHybrid: boolean = true) {
    this.vectorStore = vectorStore;
    this.reranker = reranker;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.useHybrid = useHybrid;
    this.bm25 = new BM25Retriever();

    if (useHybrid) {
      this.hybridRetriever = new HybridRetriever((query, topK) => this.vectorStore.search(query, topK), 0.5);
    }
  }

  addToBM25(docs: { id: string; content: string; metadata?: Record<string, unknown> }[]): void {
    if (this.hybridRetriever) this.hybridRetriever.addDocuments(docs);
    this.bm25.addDocuments(docs);
  }

  async retrieve(query: string): Promise<RetrievalResult> {
    const startTime = Date.now();
    let hybridSources: { bm25: number; vector: number; both: number } | undefined;

    log.debug(`Searching for top ${this.config.initialTopK} candidates`);
    const searchStart = Date.now();
    
    let filteredResults: { id: string; content: string; score: number; metadata: Record<string, unknown> }[];

    if (this.useHybrid && this.hybridRetriever && this.hybridRetriever.getDocumentCount() > 0) {
      log.debug('Using hybrid retrieval (BM25 + Vector)');
      const hybridResults = await this.hybridRetriever.search(query, this.config.initialTopK);
      
      hybridSources = { bm25: 0, vector: 0, both: 0 };
      for (const r of hybridResults) hybridSources[r.source]++;
      log.debug(`Hybrid sources`, hybridSources);
      
      filteredResults = hybridResults;
    } else {
      const initialResults = await this.vectorStore.search(query, this.config.initialTopK);
      filteredResults = initialResults;
    }
    
    const searchTimeMs = Date.now() - searchStart;
    log.debug(`Found ${filteredResults.length} candidates in ${searchTimeMs}ms`);

    if (this.config.scoreThreshold > 0) {
      filteredResults = filteredResults.filter(r => r.score >= this.config.scoreThreshold);
      log.debug(`${filteredResults.length} passed score threshold (${this.config.scoreThreshold})`);
    }

    if (filteredResults.length === 0 && this.bm25.getDocumentCount() > 0) {
      log.debug('No results, trying BM25-only fallback');
      filteredResults = this.bm25.search(query, this.config.initialTopK);
    }

    let documents: Document[] = filteredResults.map(r => ({
      id: r.id,
      content: r.content,
      metadata: { ...r.metadata, source: (r.metadata?.source as string) || 'local', relevanceScore: r.score },
    }));

    const originalCount = documents.length;
    let reranked = false;
    let rerankTimeMs = 0;

    if (this.config.enableReranking && documents.length > 0) {
      log.debug(`Reranking ${documents.length} documents to top ${this.config.rerankTopK}`);
      const rerankStart = Date.now();

      try {
        const rerankedResults = await this.reranker.rerank(query, documents.map(d => ({ content: d.content, metadata: d.metadata })));
        const topReranked = rerankedResults.slice(0, this.config.rerankTopK);

        documents = topReranked.map(r => ({
          id: documents[r.index].id,
          content: r.content,
          metadata: { ...documents[r.index].metadata, relevanceScore: r.score, rerankScore: r.score },
        }));

        reranked = true;
        rerankTimeMs = Date.now() - rerankStart;
        log.debug(`Reranked to ${documents.length} documents in ${rerankTimeMs}ms`);
      } catch (error) {
        log.error('Reranking failed, using original order', { error: String(error) });
      }
    }

    const totalTimeMs = Date.now() - startTime;
    log.debug(`Total retrieval time: ${totalTimeMs}ms`);

    return { documents, query, originalCount, rerankedCount: documents.length, reranked, searchTimeMs, rerankTimeMs, hybridSources };
  }

  async retrieveWithDecomposition(query: string, subQueries: string[]): Promise<RetrievalResult> {
    const allDocuments: Document[] = [];
    const seenIds = new Set<string>();

    for (const subQuery of [query, ...subQueries]) {
      const result = await this.retrieve(subQuery);
      for (const doc of result.documents) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocuments.push(doc);
        }
      }
    }

    if (this.config.enableReranking && allDocuments.length > this.config.rerankTopK) {
      log.debug(`Final rerank of ${allDocuments.length} merged documents`);
      
      try {
        const rerankedResults = await this.reranker.rerank(query, allDocuments.map(d => ({ content: d.content, metadata: d.metadata })));
        const topReranked = rerankedResults.slice(0, this.config.rerankTopK);

        return {
          documents: topReranked.map(r => ({
            id: allDocuments[r.index].id,
            content: r.content,
            metadata: { ...allDocuments[r.index].metadata, relevanceScore: r.score },
          })),
          query,
          originalCount: allDocuments.length,
          rerankedCount: topReranked.length,
          reranked: true,
          searchTimeMs: 0,
          rerankTimeMs: 0,
        };
      } catch (error) {
        log.error('Final reranking failed', { error: String(error) });
      }
    }

    return {
      documents: allDocuments.slice(0, this.config.rerankTopK),
      query,
      originalCount: allDocuments.length,
      rerankedCount: Math.min(allDocuments.length, this.config.rerankTopK),
      reranked: false,
      searchTimeMs: 0,
      rerankTimeMs: 0,
    };
  }

  getConfig(): RetrievalConfig { return { ...this.config }; }
  updateConfig(config: Partial<RetrievalConfig>): void { this.config = { ...this.config, ...config }; }
}

export class AgentControlledRetriever {
  private retriever: ContextualCompressionRetriever;
  private lastQuery: string | null = null;
  private lastResult: RetrievalResult | null = null;

  constructor(retriever: ContextualCompressionRetriever) {
    this.retriever = retriever;
  }

  shouldRetrieve(query: string): boolean {
    const queryLower = query.toLowerCase();
    if (query.includes('?')) return true;
    if (queryLower.includes('find') || queryLower.includes('search') || queryLower.includes('look up') || queryLower.includes('what is') || queryLower.includes('how to') || queryLower.includes('where is')) return true;
    if (queryLower.includes('function') || queryLower.includes('class') || queryLower.includes('struct') || queryLower.includes('implement') || queryLower.includes('error') || queryLower.includes('bug')) return true;
    return false;
  }

  async retrieve(query: string): Promise<RetrievalResult> {
    this.lastQuery = query;
    this.lastResult = await this.retriever.retrieve(query);
    return this.lastResult;
  }

  getLastResult(): RetrievalResult | null { return this.lastResult; }
  clearCache(): void { this.lastQuery = null; this.lastResult = null; }
}
