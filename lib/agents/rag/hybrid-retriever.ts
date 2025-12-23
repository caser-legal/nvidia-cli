/**
 * Hybrid Retriever
 * Combines BM25 (lexical) + Vector (semantic) retrieval
 * Based on NVIDIA Log Analysis Agent pattern (Dec 2025)
 * 
 * BM25: Exact matches for function names, class names, keywords
 * Vector: Semantic similarity for conceptual queries
 */

import { Document } from './types';

/**
 * BM25 Parameters
 * k1: Term frequency saturation (1.2-2.0 typical)
 * b: Length normalization (0.75 typical)
 */
interface BM25Config {
  k1: number;
  b: number;
}

const DEFAULT_BM25_CONFIG: BM25Config = { k1: 1.5, b: 0.75 };

/**
 * BM25 Retriever
 * Okapi BM25 ranking function for lexical matching
 */
export class BM25Retriever {
  private documents: Map<string, { content: string; tokens: string[]; metadata: Record<string, unknown> }> = new Map();
  private idf: Map<string, number> = new Map();
  private avgDocLength: number = 0;
  private config: BM25Config;

  constructor(config: Partial<BM25Config> = {}) {
    this.config = { ...DEFAULT_BM25_CONFIG, ...config };
  }

  /**
   * Tokenize text for BM25
   * Code-aware: preserves camelCase, snake_case, function signatures
   */
  private tokenize(text: string): string[] {
    // Split on whitespace and punctuation, but preserve code tokens
    const tokens = text
      .toLowerCase()
      // Split camelCase: viewDidLoad -> view, did, load
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split snake_case: view_did_load -> view, did, load
      .replace(/_/g, ' ')
      // Remove special chars but keep alphanumeric
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    return tokens;
  }

  /**
   * Add documents and compute IDF
   */
  addDocuments(docs: { id: string; content: string; metadata?: Record<string, unknown> }[]): void {
    // Tokenize and store
    for (const doc of docs) {
      const tokens = this.tokenize(doc.content);
      this.documents.set(doc.id, {
        content: doc.content,
        tokens,
        metadata: doc.metadata || {},
      });
    }

    // Compute IDF for all terms
    this.computeIDF();
  }

  private computeIDF(): void {
    const N = this.documents.size;
    const termDocFreq = new Map<string, number>();
    let totalLength = 0;

    // Count document frequency for each term
    for (const [, doc] of this.documents) {
      const uniqueTerms = new Set(doc.tokens);
      for (const term of uniqueTerms) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
      totalLength += doc.tokens.length;
    }

    // Compute IDF: log((N - df + 0.5) / (df + 0.5))
    for (const [term, df] of termDocFreq) {
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      this.idf.set(term, idf);
    }

    this.avgDocLength = totalLength / N;
  }

  /**
   * Search using BM25 scoring
   */
  search(query: string, topK: number = 10): { id: string; content: string; score: number; metadata: Record<string, unknown> }[] {
    const queryTokens = this.tokenize(query);
    const scores: { id: string; content: string; score: number; metadata: Record<string, unknown> }[] = [];

    for (const [id, doc] of this.documents) {
      const score = this.computeBM25Score(queryTokens, doc.tokens);
      if (score > 0) {
        scores.push({ id, content: doc.content, score, metadata: doc.metadata });
      }
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private computeBM25Score(queryTokens: string[], docTokens: string[]): number {
    const { k1, b } = this.config;
    const docLength = docTokens.length;
    const termFreq = new Map<string, number>();

    // Count term frequency in document
    for (const token of docTokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    let score = 0;
    for (const term of queryTokens) {
      const tf = termFreq.get(term) || 0;
      const idf = this.idf.get(term) || 0;

      if (tf > 0 && idf > 0) {
        // BM25 formula
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLength / this.avgDocLength));
        score += idf * (numerator / denominator);
      }
    }

    return score;
  }

  clear(): void {
    this.documents.clear();
    this.idf.clear();
    this.avgDocLength = 0;
  }

  getDocumentCount(): number {
    return this.documents.size;
  }
}

/**
 * Hybrid Retriever
 * Combines BM25 + Vector search with score fusion
 */
export class HybridRetriever {
  private bm25: BM25Retriever;
  private vectorSearch: (query: string, topK: number) => Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown> }[]>;
  private alpha: number; // Weight for vector vs BM25 (0.5 = equal)

  constructor(
    vectorSearch: (query: string, topK: number) => Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown> }[]>,
    alpha: number = 0.5
  ) {
    this.bm25 = new BM25Retriever();
    this.vectorSearch = vectorSearch;
    this.alpha = alpha;
  }

  /**
   * Add documents to BM25 index
   */
  addDocuments(docs: { id: string; content: string; metadata?: Record<string, unknown> }[]): void {
    this.bm25.addDocuments(docs);
  }

  /**
   * Hybrid search with Reciprocal Rank Fusion (RRF)
   */
  async search(query: string, topK: number = 10): Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown>; source: 'bm25' | 'vector' | 'both' }[]> {
    // Get results from both retrievers
    const [bm25Results, vectorResults] = await Promise.all([
      Promise.resolve(this.bm25.search(query, topK * 2)),
      this.vectorSearch(query, topK * 2),
    ]);

    // Reciprocal Rank Fusion
    const k = 60; // RRF constant
    const fusedScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown>; source: Set<string> }>();

    // Add BM25 scores
    bm25Results.forEach((result, rank) => {
      const rrfScore = (1 - this.alpha) / (k + rank + 1);
      const existing = fusedScores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
        existing.source.add('bm25');
      } else {
        fusedScores.set(result.id, {
          score: rrfScore,
          content: result.content,
          metadata: result.metadata,
          source: new Set(['bm25']),
        });
      }
    });

    // Add vector scores
    vectorResults.forEach((result, rank) => {
      const rrfScore = this.alpha / (k + rank + 1);
      const existing = fusedScores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
        existing.source.add('vector');
      } else {
        fusedScores.set(result.id, {
          score: rrfScore,
          content: result.content,
          metadata: result.metadata,
          source: new Set(['vector']),
        });
      }
    });

    // Sort by fused score and return top K
    const results = Array.from(fusedScores.entries())
      .map(([id, data]) => ({
        id,
        content: data.content,
        score: data.score,
        metadata: data.metadata,
        source: (data.source.size === 2 ? 'both' : data.source.has('bm25') ? 'bm25' : 'vector') as 'bm25' | 'vector' | 'both',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  clear(): void {
    this.bm25.clear();
  }

  getDocumentCount(): number {
    return this.bm25.getDocumentCount();
  }
}
