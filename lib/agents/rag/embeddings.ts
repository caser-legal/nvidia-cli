/**
 * NVIDIA Embeddings Client
 * Uses NVIDIA NIM endpoints for text embeddings
 * Based on NVIDIA RAG Blueprint
 */

import { EmbeddingConfig } from './types';

const NVIDIA_EMBEDDING_MODELS = {
  'llama-3.2-nv-embedqa-1b-v2': {
    dimensions: 2048,
    maxTokens: 8192,  // NVIDIA spec: 8192 tokens
  },
  'llama-3.2-nemoretriever-300m-embed-v2': {
    dimensions: 2048,
    maxTokens: 8192,
  },
  'llama-3.2-nemoretriever-300m-embed-v1': {
    dimensions: 2048,
    maxTokens: 8192,
  },
  'nv-embedqa-e5-v5': {
    dimensions: 1024,
    maxTokens: 512,
  },
  'nv-embedqa-mistral-7b-v2': {
    dimensions: 4096,
    maxTokens: 512,
  },
  'nv-embed-v1': {
    dimensions: 4096,
    maxTokens: 512,
  },
  'bge-m3': {
    dimensions: 1024,
    maxTokens: 8192,
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

    if (texts.length === 0) {
      return [];
    }

    // NVIDIA API supports up to 64 inputs per request - use max
    const batchSize = 64;
    const allEmbeddings: number[][] = [];

    console.log(`[RAG Embeddings] Processing ${texts.length} texts in batches of ${batchSize}`);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // Model supports 8192 tokens (~32k chars) - truncate only if absolutely necessary
      const truncatedBatch = batch.map(text => text.slice(0, 32000));
      
      console.log(`[RAG Embeddings] Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}`);
      
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: truncatedBatch,
          input_type: 'passage',
          encoding_format: 'float',
          truncate: 'END',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[RAG Embeddings] API error:`, error);
        throw new Error(`Embedding API error: ${error}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        console.error(`[RAG Embeddings] Unexpected response:`, JSON.stringify(data).slice(0, 500));
        throw new Error('Invalid embedding response format');
      }
      
      const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);
      allEmbeddings.push(...embeddings);
    }

    console.log(`[RAG Embeddings] Successfully embedded ${allEmbeddings.length} texts`);
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
    // Handle model names with or without 'nvidia/' prefix
    const modelName = this.config.model.replace(/^nvidia\//, '');
    const modelInfo = NVIDIA_EMBEDDING_MODELS[modelName as keyof typeof NVIDIA_EMBEDDING_MODELS];
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
    // Reranking uses ai.api.nvidia.com with model-specific path
    this.baseUrl = 'https://ai.api.nvidia.com/v1/retrieval';
  }

  async rerank(query: string, documents: { content: string; metadata?: Record<string, unknown> }[]): Promise<{ index: number; score: number; content: string; metadata?: Record<string, unknown> }[]> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA API key required for reranking');
    }

    if (documents.length === 0) {
      return [];
    }

    // Model path uses underscores: nvidia/llama-3_2-nv-rerankqa-1b-v2
    const modelPath = this.model.replace(/\./g, '_');
    
    const response = await fetch(`${this.baseUrl}/${modelPath}/reranking`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        query: { text: query },
        passages: documents.map((doc) => ({
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
    if (docs.length === 0) return;
    
    // Process in batches - NVIDIA API max is 64
    const batchSize = 64;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const contents = batch.map(d => d.content);
      
      try {
        const embeddings = await this.embeddings.embed(contents);
        
        batch.forEach((doc, idx) => {
          if (embeddings[idx]) {
            this.documents.set(doc.id, {
              content: doc.content,
              embedding: embeddings[idx],
              metadata: doc.metadata || {},
            });
          }
        });
      } catch (error) {
        console.error(`[RAG] Error embedding batch ${i}-${i + batchSize}:`, error);
        throw error;
      }
    }
    
    // Auto-save after adding documents
    await this.saveToDisk();
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
    // Also clear persisted data
    this.deleteFromDisk();
  }

  // Persistence methods
  private getStorePath(): string {
    return '/Users/home/Documents/nvidia-cli/.rag-store.json';
  }

  async saveToDisk(): Promise<void> {
    const fs = await import('fs/promises');
    const data: Record<string, { content: string; embedding: number[]; metadata: Record<string, unknown> }> = {};
    for (const [id, doc] of this.documents) {
      data[id] = doc;
    }
    await fs.writeFile(this.getStorePath(), JSON.stringify(data), 'utf-8');
    console.log(`[RAG] Saved ${this.documents.size} documents to disk`);
  }

  async loadFromDisk(): Promise<void> {
    const fs = await import('fs/promises');
    try {
      const raw = await fs.readFile(this.getStorePath(), 'utf-8');
      const data = JSON.parse(raw);
      for (const [id, doc] of Object.entries(data)) {
        this.documents.set(id, doc as { content: string; embedding: number[]; metadata: Record<string, unknown> });
      }
      console.log(`[RAG] Loaded ${this.documents.size} documents from disk`);
    } catch {
      // File doesn't exist yet, that's fine
    }
  }

  private async deleteFromDisk(): Promise<void> {
    const fs = await import('fs/promises');
    try {
      await fs.unlink(this.getStorePath());
    } catch {
      // File doesn't exist, that's fine
    }
  }
}
