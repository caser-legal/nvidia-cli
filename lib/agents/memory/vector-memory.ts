/**
 * Vector-Based Memory Store
 * Based on NVIDIA RAG Blueprint multi-turn conversation pattern
 * 
 * NVIDIA approach: Store conversation history in a dedicated vector store
 * with semantic retrieval - not just keyword matching.
 * 
 * Reference: https://nvidia.github.io/GenerativeAIExamples/0.5.0/multi-turn.html
 * "The chain server stores the conversation history and knowledge base in a 
 * vector database and retrieves them at runtime to understand contextual queries."
 */

import * as fs from "fs/promises";
import * as path from "path";
import { NVIDIAEmbeddings } from "../rag/embeddings";

const MEMORY_DIR = "/Users/home/.nvidia-cli/memory";
const MEMORY_STORE_FILE = path.join(MEMORY_DIR, "vector-memory.json");

export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: "fact" | "context" | "decision" | "entity" | "task" | "conversation";
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

interface StoredEntry extends MemoryEntry {
  embedding: number[];
}

/**
 * Unified Vector Memory Store
 * Single store for all memories - no short-term/long-term distinction
 * Everything persists and is retrieved via semantic search
 */
export class VectorMemoryStore {
  private entries: Map<string, StoredEntry> = new Map();
  private embeddings: NVIDIAEmbeddings;
  private loaded = false;
  private dirty = false;

  constructor() {
    this.embeddings = new NVIDIAEmbeddings({
      provider: 'nvidia',
      model: "nvidia/llama-3.2-nv-embedqa-1b-v2",
      dimensions: 2048,
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      const data = await fs.readFile(MEMORY_STORE_FILE, "utf-8");
      const parsed = JSON.parse(data) as StoredEntry[];
      for (const entry of parsed) {
        this.entries.set(entry.id, entry);
      }
      console.log(`[VectorMemory] Loaded ${this.entries.size} memories from disk`);
    } catch {
      // No existing store - start fresh
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const data = Array.from(this.entries.values());
    await fs.writeFile(MEMORY_STORE_FILE, JSON.stringify(data, null, 2));
    this.dirty = false;
  }

  /**
   * Add a memory entry with embedding
   */
  async add(
    type: MemoryEntry["type"],
    content: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    await this.ensureLoaded();

    const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Embed the content for semantic search
    const [embedding] = await this.embeddings.embed([content]);
    
    const entry: StoredEntry = {
      id,
      timestamp: new Date().toISOString(),
      type,
      content,
      sessionId,
      metadata,
      embedding,
    };

    this.entries.set(id, entry);
    this.dirty = true;
    
    // Auto-save (debounced in production, immediate for simplicity)
    await this.save();
    
    return entry;
  }

  /**
   * Semantic search for relevant memories
   * This is the NVIDIA way - vector similarity, not keyword matching
   */
  async search(query: string, topK: number = 10, sessionId?: string): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    if (this.entries.size === 0) return [];

    // Embed the query
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    // Calculate similarity scores
    const scored: { entry: StoredEntry; score: number }[] = [];
    
    for (const entry of this.entries.values()) {
      // Optionally filter by session
      if (sessionId && entry.sessionId && entry.sessionId !== sessionId) {
        continue;
      }
      
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      scored.push({ entry, score });
    }

    // Sort by score and return top K
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ entry }) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        type: entry.type,
        content: entry.content,
        sessionId: entry.sessionId,
        metadata: { ...entry.metadata, score: scored.find(s => s.entry.id === entry.id)?.score },
      }));
  }

  /**
   * Get recent memories (for context window)
   */
  async getRecent(count: number = 20, sessionId?: string): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    let entries = Array.from(this.entries.values());
    
    if (sessionId) {
      entries = entries.filter(e => e.sessionId === sessionId);
    }
    
    return entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count)
      .map(({ embedding: _, ...rest }) => rest);
  }

  /**
   * Get all memories of a specific type
   */
  async getByType(type: MemoryEntry["type"]): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    return Array.from(this.entries.values())
      .filter(e => e.type === type)
      .map(({ embedding: _, ...rest }) => rest);
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    
    if (this.entries.has(id)) {
      this.entries.delete(id);
      this.dirty = true;
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * Clear all memories (or just for a session)
   */
  async clear(sessionId?: string): Promise<number> {
    await this.ensureLoaded();
    
    let count = 0;
    if (sessionId) {
      for (const [id, entry] of this.entries) {
        if (entry.sessionId === sessionId) {
          this.entries.delete(id);
          count++;
        }
      }
    } else {
      count = this.entries.size;
      this.entries.clear();
    }
    
    this.dirty = true;
    await this.save();
    return count;
  }

  /**
   * Get total count
   */
  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.entries.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

// Singleton instance
let vectorMemoryInstance: VectorMemoryStore | null = null;

export function getVectorMemory(): VectorMemoryStore {
  if (!vectorMemoryInstance) {
    vectorMemoryInstance = new VectorMemoryStore();
  }
  return vectorMemoryInstance;
}
