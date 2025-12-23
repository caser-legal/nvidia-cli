/**
 * Contextual Compression Retriever
 * Based on NVIDIA RAG Blueprint and LangChain's ContextualCompressionRetriever
 * 
 * Pattern: Wide retrieval (100 chunks) → Rerank → Narrow (10 chunks)
 * 
 * This chains the vector retriever with the reranker for optimal results:
 * 1. Embedding model casts wide net (fast, cheap)
 * 2. Reranker narrows to most relevant (slow, accurate)
 */

import { Document } from './types';
import { NVIDIAReranker, SimpleVectorStore } from './embeddings';
import { RetrievalConfig, DEFAULT_RETRIEVAL_CONFIG } from './config';

export interface RetrievalResult {
  documents: Document[];
  query: string;
  originalCount: number;
  rerankedCount: number;
  reranked: boolean;
  searchTimeMs: number;
  rerankTimeMs: number;
}

/**
 * ContextualCompressionRetriever
 * Combines vector retrieval with reranking for optimal accuracy
 * Based on NVIDIA RAG Blueprint pattern
 */
export class ContextualCompressionRetriever {
  private vectorStore: SimpleVectorStore;
  private reranker: NVIDIAReranker;
  private config: RetrievalConfig;

  constructor(
    vectorStore: SimpleVectorStore,
    reranker: NVIDIAReranker,
    config: Partial<RetrievalConfig> = {}
  ) {
    this.vectorStore = vectorStore;
    this.reranker = reranker;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * Retrieve and rerank documents
   * Implements the NVIDIA ContextualCompressionRetriever pattern
   */
  async retrieve(query: string): Promise<RetrievalResult> {
    const startTime = Date.now();

    // Step 1: Wide retrieval from vector store
    console.log(`[Retriever] Searching for top ${this.config.initialTopK} candidates...`);
    const searchStart = Date.now();
    
    const initialResults = await this.vectorStore.search(query, this.config.initialTopK);
    const searchTimeMs = Date.now() - searchStart;
    
    console.log(`[Retriever] Found ${initialResults.length} candidates in ${searchTimeMs}ms`);

    // Filter by score threshold if set
    let filteredResults = initialResults;
    if (this.config.scoreThreshold > 0) {
      filteredResults = initialResults.filter(r => r.score >= this.config.scoreThreshold);
      console.log(`[Retriever] ${filteredResults.length} passed score threshold (${this.config.scoreThreshold})`);
    }

    // If no results, try text search fallback
    if (filteredResults.length === 0) {
      console.log('[Retriever] No vector results, trying text search fallback...');
      const textResults = this.vectorStore.textSearch(query, this.config.initialTopK);
      filteredResults = textResults;
    }

    // Convert to Document format
    let documents: Document[] = filteredResults.map(r => ({
      id: r.id,
      content: r.content,
      metadata: {
        ...r.metadata,
        source: (r.metadata?.source as string) || 'local',
        relevanceScore: r.score,
      },
    }));

    const originalCount = documents.length;
    let reranked = false;
    let rerankTimeMs = 0;

    // Step 2: Rerank if enabled and we have results
    if (this.config.enableReranking && documents.length > 0) {
      console.log(`[Retriever] Reranking ${documents.length} documents to top ${this.config.rerankTopK}...`);
      const rerankStart = Date.now();

      try {
        const rerankedResults = await this.reranker.rerank(
          query,
          documents.map(d => ({ content: d.content, metadata: d.metadata }))
        );

        // Take top K after reranking
        const topReranked = rerankedResults.slice(0, this.config.rerankTopK);

        documents = topReranked.map(r => ({
          id: documents[r.index].id,
          content: r.content,
          metadata: {
            ...documents[r.index].metadata,
            relevanceScore: r.score,
            rerankScore: r.score,
          },
        }));

        reranked = true;
        rerankTimeMs = Date.now() - rerankStart;
        console.log(`[Retriever] Reranked to ${documents.length} documents in ${rerankTimeMs}ms`);
      } catch (error) {
        console.error('[Retriever] Reranking failed, using original order:', error);
      }
    }

    const totalTimeMs = Date.now() - startTime;
    console.log(`[Retriever] Total retrieval time: ${totalTimeMs}ms`);

    return {
      documents,
      query,
      originalCount,
      rerankedCount: documents.length,
      reranked,
      searchTimeMs,
      rerankTimeMs,
    };
  }

  /**
   * Retrieve with query decomposition
   * Breaks complex queries into sub-queries and merges results
   */
  async retrieveWithDecomposition(
    query: string,
    subQueries: string[]
  ): Promise<RetrievalResult> {
    const allDocuments: Document[] = [];
    const seenIds = new Set<string>();

    // Retrieve for each sub-query
    for (const subQuery of [query, ...subQueries]) {
      const result = await this.retrieve(subQuery);
      
      for (const doc of result.documents) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocuments.push(doc);
        }
      }
    }

    // Final rerank of merged results
    if (this.config.enableReranking && allDocuments.length > this.config.rerankTopK) {
      console.log(`[Retriever] Final rerank of ${allDocuments.length} merged documents...`);
      
      try {
        const rerankedResults = await this.reranker.rerank(
          query,
          allDocuments.map(d => ({ content: d.content, metadata: d.metadata }))
        );

        const topReranked = rerankedResults.slice(0, this.config.rerankTopK);

        return {
          documents: topReranked.map(r => ({
            id: allDocuments[r.index].id,
            content: r.content,
            metadata: {
              ...allDocuments[r.index].metadata,
              relevanceScore: r.score,
            },
          })),
          query,
          originalCount: allDocuments.length,
          rerankedCount: topReranked.length,
          reranked: true,
          searchTimeMs: 0,
          rerankTimeMs: 0,
        };
      } catch (error) {
        console.error('[Retriever] Final reranking failed:', error);
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

  /**
   * Get configuration
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Agent-Controlled Retriever
 * Wraps retriever as a tool that the agent can choose to use
 * Based on NVIDIA's agentic RAG pattern where agent decides when to search
 */
export class AgentControlledRetriever {
  private retriever: ContextualCompressionRetriever;
  private lastQuery: string | null = null;
  private lastResult: RetrievalResult | null = null;

  constructor(retriever: ContextualCompressionRetriever) {
    this.retriever = retriever;
  }

  /**
   * Check if retrieval is needed for a query
   * Agent can call this to decide whether to search
   */
  shouldRetrieve(query: string): boolean {
    // Simple heuristics - agent should override with LLM judgment
    const queryLower = query.toLowerCase();
    
    // Questions typically need retrieval
    if (query.includes('?')) return true;
    
    // Explicit search requests
    if (queryLower.includes('find') || 
        queryLower.includes('search') || 
        queryLower.includes('look up') ||
        queryLower.includes('what is') ||
        queryLower.includes('how to') ||
        queryLower.includes('where is')) {
      return true;
    }
    
    // Code-related queries
    if (queryLower.includes('function') ||
        queryLower.includes('class') ||
        queryLower.includes('struct') ||
        queryLower.includes('implement') ||
        queryLower.includes('error') ||
        queryLower.includes('bug')) {
      return true;
    }
    
    return false;
  }

  /**
   * Retrieve documents (agent calls this when needed)
   */
  async retrieve(query: string): Promise<RetrievalResult> {
    this.lastQuery = query;
    this.lastResult = await this.retriever.retrieve(query);
    return this.lastResult;
  }

  /**
   * Get last retrieval result (for context building)
   */
  getLastResult(): RetrievalResult | null {
    return this.lastResult;
  }

  /**
   * Clear cached results
   */
  clearCache(): void {
    this.lastQuery = null;
    this.lastResult = null;
  }
}
