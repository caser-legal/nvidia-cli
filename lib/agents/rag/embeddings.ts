import * as os from "os";
/**
 * NVIDIA Embeddings Client
 * Uses local embedding server or NVIDIA NIM endpoints
 */

import { EmbeddingConfig } from './types';
import { createLogger } from '../../logger';
import { NVIDIA_API_KEY } from '../../api-key';

const log = createLogger("RAGv2");

const USE_LOCAL_LLM = "false" === "true";
const LOCAL_EMBED_URL = "" || "http://127.0.0.1:8000";

const NVIDIA_EMBEDDING_MODELS = {
  'llama-3.2-nv-embedqa-1b-v2': { dimensions: 2048, maxTokens: 8192 },
  'llama-nemotron-embed-1b-v2': { dimensions: 2048, maxTokens: 8192 },
  'llama-3.2-nemoretriever-300m-embed-v2': { dimensions: 2048, maxTokens: 8192 },
  'llama-3.2-nemoretriever-300m-embed-v1': { dimensions: 2048, maxTokens: 8192 },
  'nv-embedqa-e5-v5': { dimensions: 1024, maxTokens: 512 },
  'nv-embedqa-mistral-7b-v2': { dimensions: 4096, maxTokens: 512 },
  'nv-embed-v1': { dimensions: 4096, maxTokens: 512 },
  'bge-m3': { dimensions: 1024, maxTokens: 8192 },
};

export class NVIDIAEmbeddings {
  private config: EmbeddingConfig;
  private baseUrl: string;
  private useLocal: boolean;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.useLocal = USE_LOCAL_LLM;
    this.baseUrl = this.useLocal ? LOCAL_EMBED_URL : (config.baseUrl || 'https://integrate.api.nvidia.com/v1');
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.useLocal) return this.embedLocal(texts);

    const apiKey = this.config.apiKey || NVIDIA_API_KEY;
    if (!apiKey) throw new Error('NVIDIA API key required for embeddings');

    const batchSize = 64;
    const allEmbeddings: number[][] = [];

    log.debug(`Processing ${texts.length} texts in batches of ${batchSize}`);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const truncatedBatch = batch.map(text => text.slice(0, 32000));
      
      log.debug(`Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}`);
      
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, input: truncatedBatch, input_type: 'passage', encoding_format: 'float', truncate: 'END' }),
      });

      if (!response.ok) {
        const error = await response.text();
        log.error('API error', { error });
        throw new Error(`Embedding API error: ${error}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        log.error('Unexpected response', { response: JSON.stringify(data).slice(0, 500) });
        throw new Error('Invalid embedding response format');
      }
      
      const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);
      allEmbeddings.push(...embeddings);
    }

    log.debug(`Successfully embedded ${allEmbeddings.length} texts`);
    return allEmbeddings;
  }

  private async embedLocal(texts: string[]): Promise<number[][]> {
    log.debug(`Using local server at ${this.baseUrl}`);
    
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, input_type: 'passage' }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local embedding error: ${error}`);
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }

  private async embedQueryLocal(query: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [query], input_type: 'query' }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local embedding error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedQuery(query: string): Promise<number[]> {
    if (this.useLocal) return this.embedQueryLocal(query);

    const apiKey = this.config.apiKey || NVIDIA_API_KEY;
    if (!apiKey) throw new Error('NVIDIA API key required for embeddings');

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.model, input: [query], input_type: 'query', encoding_format: 'float', truncate: 'END' }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  getDimensions(): number {
    const modelName = this.config.model.replace(/^nvidia\//, '');
    const modelInfo = NVIDIA_EMBEDDING_MODELS[modelName as keyof typeof NVIDIA_EMBEDDING_MODELS];
    return modelInfo?.dimensions || this.config.dimensions || 1024;
  }
}

export class NVIDIAReranker {
  private model: string;
  private topN: number;
  private baseUrl: string;
  private useLocal: boolean;
  private localUrl: string;
  private static lastCallTime = 0;
  private static readonly DEFAULT_RATE_LIMIT_MS = 1000;
  private static readonly RATE_LIMIT_MS: number = Number("") || 1000;

  constructor(model: string = 'nvidia/llama-3.2-nv-rerankqa-1b-v2', topN: number = 5) {
    this.model = model;
    this.topN = topN;
    this.useLocal = USE_LOCAL_LLM;
    this.localUrl = LOCAL_EMBED_URL;
    this.baseUrl = 'https://ai.api.nvidia.com/v1/retrieval';
  }

  /**
   * Perform a fetch request with exponential backoff retry on 429 responses.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<Response> {
    let retries = 0;
    while (true) {
      const response = await fetch(url, options);
      if (response.ok || response.status !== 429) {
        return response;
      }
      if (retries >= maxRetries) {
        const errorBody = await response.text();
        throw new Error(
          `Rerank request failed after ${maxRetries} retries: ${response.status} ${errorBody}`
        );
      }
      const delayMs = baseDelay * Math.pow(2, retries);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      retries++;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - NVIDIAReranker.lastCallTime;
    if (elapsed < NVIDIAReranker.RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, NVIDIAReranker.RATE_LIMIT_MS - elapsed));
    }
    NVIDIAReranker.lastCallTime = Date.now();
  }

  async rerank(query: string, documents: { content: string; metadata?: Record<string, unknown> }[]): Promise<{ index: number; score: number; content: string; metadata?: Record<string, unknown> }[]> {
    if (documents.length === 0) return [];
    if (this.useLocal) return this.rerankLocal(query, documents);
    
    await this.throttle();

    const apiKey = NVIDIA_API_KEY;
    if (!apiKey) throw new Error('NVIDIA API key required for reranking');

    const modelPath = this.model.replace(/\./g, '_');
    
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/${modelPath}/reranking`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          query: { text: query },
          passages: documents.map((doc) => ({ text: doc.content })),
          top_n: Math.min(this.topN, documents.length),
          truncate: 'END',
        }),
      },
      3,
      1000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Reranking API error: ${error}`);
    }

    const data = await response.json();
    return data.rankings.map((ranking: { index: number; logit: number }) => ({
      index: ranking.index,
      score: this.logitToScore(ranking.logit),
      content: documents[ranking.index].content,
      metadata: documents[ranking.index].metadata,
    }));
  }

  private async rerankLocal(query: string, documents: { content: string; metadata?: Record<string, unknown> }[]): Promise<{ index: number; score: number; content: string; metadata?: Record<string, unknown> }[]> {
    log.debug(`Using local server at ${this.localUrl}`);
    
    const response = await fetch(`${this.localUrl}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents: documents.map(d => d.content) }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local reranking error: ${error}`);
    }

    const data = await response.json();
    return data.rankings.map((ranking: { index: number; score: number }) => ({
      index: ranking.index,
      score: ranking.score,
      content: documents[ranking.index].content,
      metadata: documents[ranking.index].metadata,
    }));
  }

  private logitToScore(logit: number): number {
    return 1 / (1 + Math.exp(-logit * 0.1));
  }
}

export class SimpleVectorStore {
  private documents: Map<string, { content: string; embedding: number[]; metadata: Record<string, unknown> }> = new Map();
  private embeddings: NVIDIAEmbeddings;

  constructor(embeddings: NVIDIAEmbeddings) {
    this.embeddings = embeddings;
  }

  async addDocuments(docs: { id: string; content: string; metadata?: Record<string, unknown> }[]): Promise<void> {
    if (docs.length === 0) return;
    
    const batchSize = 64;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const contents = batch.map(d => d.content);
      
      try {
        const embeddings = await this.embeddings.embed(contents);
        batch.forEach((doc, idx) => {
          if (embeddings[idx]) {
            this.documents.set(doc.id, { content: doc.content, embedding: embeddings[idx], metadata: doc.metadata || {} });
          }
        });
      } catch (error) {
        log.error(`Error embedding batch ${i}-${i + batchSize}`, { error: String(error) });
        throw error;
      }
    }
    
    await this.saveToDisk();
  }

  async search(query: string, topK: number = 5): Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown> }[]> {
    await this.validateDocuments();
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    const results: { id: string; content: string; score: number; metadata: Record<string, unknown> }[] = [];
    
    for (const [id, doc] of this.documents) {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({ id, content: doc.content, score, metadata: doc.metadata });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async validateDocuments(): Promise<{ removed: number; total: number }> {
    const fs = await import('fs/promises');
    const staleIds: string[] = [];
    
    for (const [id, doc] of this.documents) {
      const sourcePath = doc.metadata?.source as string;
      if (sourcePath && sourcePath.startsWith('/')) {
        try { await fs.access(sourcePath); } catch { staleIds.push(id); }
      }
    }
    
    if (staleIds.length > 0) {
      log.info(`Removing ${staleIds.length} stale documents (source files no longer exist)`);
      for (const id of staleIds) this.documents.delete(id);
      await this.saveToDisk();
    }
    
    return { removed: staleIds.length, total: this.documents.size };
  }

  async updateDocuments(sourcePath: string): Promise<{ updated: number; removed: number }> {
    const toRemove: string[] = [];
    for (const [id, doc] of this.documents) {
      const docSource = doc.metadata?.source as string;
      if (docSource && docSource.startsWith(sourcePath)) toRemove.push(id);
    }
    
    for (const id of toRemove) this.documents.delete(id);
    
    log.info(`Removed ${toRemove.length} documents from ${sourcePath} for re-ingestion`);
    await this.saveToDisk();
    
    return { updated: 0, removed: toRemove.length };
  }

  deleteBySource(sourcePath: string): number {
    const toRemove: string[] = [];
    for (const [id, doc] of this.documents) {
      const docSource = doc.metadata?.source as string;
      if (docSource && docSource.startsWith(sourcePath)) toRemove.push(id);
    }
    for (const id of toRemove) this.documents.delete(id);
    return toRemove.length;
  }

  getSourceFiles(): string[] {
    const sources = new Set<string>();
    for (const [, doc] of this.documents) {
      const source = doc.metadata?.source as string;
      if (source) sources.add(source);
    }
    return Array.from(sources);
  }

  textSearch(query: string, topK: number = 5): { id: string; content: string; score: number; metadata: Record<string, unknown> }[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    
    const results: { id: string; content: string; score: number; metadata: Record<string, unknown> }[] = [];
    
    for (const [id, doc] of this.documents) {
      const contentLower = doc.content.toLowerCase();
      let matchCount = 0;
      let exactMatch = false;
      
      if (contentLower.includes(queryLower)) {
        exactMatch = true;
        matchCount = queryTerms.length;
      } else {
        for (const term of queryTerms) {
          if (contentLower.includes(term)) matchCount++;
        }
      }
      
      if (matchCount > 0) {
        const score = exactMatch ? 1.0 : matchCount / queryTerms.length;
        results.push({ id, content: doc.content, score, metadata: doc.metadata });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getDocumentCount(): number { return this.documents.size; }

  clear(): void {
    this.documents.clear();
    this.deleteFromDisk();
  }

  private getStorePath(): string {
    const homeDir = process.env.HOME || os.homedir();
    return `${homeDir}/.nvidia-cli/.rag-store.json`;
  }

  async saveToDisk(): Promise<void> {
    const fs = await import('fs/promises');
    const data: Record<string, { content: string; embedding: number[]; metadata: Record<string, unknown> }> = {};
    for (const [id, doc] of this.documents) data[id] = doc;
    await fs.writeFile(this.getStorePath(), JSON.stringify(data), 'utf-8');
    log.info(`Saved ${this.documents.size} documents to disk`);
  }

  async loadFromDisk(): Promise<void> {
    const fs = await import('fs/promises');
    try {
      const raw = await fs.readFile(this.getStorePath(), 'utf-8');
      const data = JSON.parse(raw);
      for (const [id, doc] of Object.entries(data)) {
        this.documents.set(id, doc as { content: string; embedding: number[]; metadata: Record<string, unknown> });
      }
      log.info(`Loaded ${this.documents.size} documents from disk`);
    } catch { /* File doesn't exist yet */ }
  }

  private async deleteFromDisk(): Promise<void> {
    const fs = await import('fs/promises');
    try { await fs.unlink(this.getStorePath()); } catch { /* File doesn't exist */ }
  }
}