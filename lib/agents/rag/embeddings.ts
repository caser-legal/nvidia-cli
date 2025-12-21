/**
 * NVIDIA Embeddings Client
 * Uses NVIDIA NIM endpoints for text embeddings
 * Based on NVIDIA RAG Blueprint
 */

import { EmbeddingConfig } from './types';

const NVIDIA_EMBEDDING_MODELS = {
  'llama-3.2-nv-embedqa-1b-v2': {
    dimensions: 2048,
    maxTokens: 512,
  },
  'nv-embedqa-e5-v5': {
    dimensions: 1024,
    maxTokens: 512,
  },
  'nv-embed-v1': {
    dimensions: 4096,
    maxTokens: 512,
  },
};

export class NVIDIAEmbeddings {
  private config: EmbeddingConfig;
  private baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://integrate.api.nvidia.com/v1';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.apiKey || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA API key required for embeddings');
    }

    // Batch texts to avoid rate limits
    const batchSize = 10;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: batch,
          input_type: 'passage', // or 'query' for search queries
          encoding_format: 'float',
          truncate: 'END',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${error}`);
      }

      const data = await response.json();
      const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    const apiKey = this.config.apiKey || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA API key required for embeddings');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: [query],
        input_type: 'query', // Use query type for search
        encoding_format: 'float',
        truncate: 'END',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  getDimensions(): number {
    const modelInfo = NVIDIA_EMBEDDING_MODELS[this.config.model as keyof typeof NVIDIA_EMBEDDING_MODELS];
    return modelInfo?.dimensions || this.config.dimensions || 1024;
  }
}

/**
 * NVIDIA Reranker Client
 * Uses NVIDIA NIM endpoints for document reranking
 */
export class NVIDIAReranker {
  private model: string;
  private topN: number;
  private baseUrl: string;

  constructor(model: string = 'nvidia/llama-3.2-nv-rerankqa-1b-v2', topN: number = 5) {
    this.model = model;
    this.topN = topN;
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
  }

  async rerank(query: string, documents: { content: string; metadata?: Record<string, unknown> }[]): Promise<{ index: number; score: number; content: string; metadata?: Record<string, unknown> }[]> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA API key required for reranking');
    }

    if (documents.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}/ranking`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        query: { text: query },
        passages: documents.map((doc, idx) => ({
          text: doc.content,
        })),
        top_n: Math.min(this.topN, documents.length),
        truncate: 'END',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Reranking API error: ${error}`);
    }

    const data = await response.json();
    
    // Map results back to original documents with scores
    return data.rankings.map((ranking: { index: number; logit: number }) => ({
      index: ranking.index,
      score: this.logitToScore(ranking.logit),
      content: documents[ranking.index].content,
      metadata: documents[ranking.index].metadata,
    }));
  }

  private logitToScore(logit: number): number {
    // Convert logit to 0-1 score using sigmoid
    return 1 / (1 + Math.exp(-logit * 0.1));
  }
}

/**
 * Simple in-memory vector store for local RAG
 * For production, use Milvus, Qdrant, or ChromaDB
 */
export class SimpleVectorStore {
  private documents: Map<string, { content: string; embedding: number[]; metadata: Record<string, unknown> }> = new Map();
  private embeddings: NVIDIAEmbeddings;

  constructor(embeddings: NVIDIAEmbeddings) {
    this.embeddings = embeddings;
  }

  async addDocuments(docs: { id: string; content: string; metadata?: Record<string, unknown> }[]): Promise<void> {
    const contents = docs.map(d => d.content);
    const embeddings = await this.embeddings.embed(contents);

    docs.forEach((doc, idx) => {
      this.documents.set(doc.id, {
        content: doc.content,
        embedding: embeddings[idx],
        metadata: doc.metadata || {},
      });
    });
  }

  async search(query: string, topK: number = 5): Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown> }[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    const results: { id: string; content: string; score: number; metadata: Record<string, unknown> }[] = [];
    
    for (const [id, doc] of this.documents) {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({ id, content: doc.content, score, metadata: doc.metadata });
    }

    // Sort by score descending and return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getDocumentCount(): number {
    return this.documents.size;
  }

  clear(): void {
    this.documents.clear();
  }
}
