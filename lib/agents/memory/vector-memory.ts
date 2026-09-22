import * as os from "os";
/**
 * Vector-Based Memory Store
 * Based on NVIDIA RAG Blueprint multi-turn conversation pattern
 */

import * as fs from "fs/promises";
import * as path from "path";
import { NVIDIAEmbeddings } from "../rag/embeddings";
import { createLogger } from "../../logger";

const log = createLogger("VectorMemory");

const HOME_DIR = process.env.HOME || os.homedir();
const MEMORY_DIR = path.join(HOME_DIR, ".nvidia-cli", "memory");
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
      log.info(`Loaded ${this.entries.size} memories from disk`);
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

  async add(
    type: MemoryEntry["type"],
    content: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    await this.ensureLoaded();

    const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
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
    await this.save();
    
    return entry;
  }

  async search(query: string, topK: number = 10, sessionId?: string): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    if (this.entries.size === 0) return [];

    const queryEmbedding = await this.embeddings.embedQuery(query);
    const scored: { entry: StoredEntry; score: number }[] = [];
    
    for (const entry of this.entries.values()) {
      if (sessionId && entry.sessionId && entry.sessionId !== sessionId) continue;
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      scored.push({ entry, score });
    }

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

  async getRecent(count: number = 20, sessionId?: string): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    let entries = Array.from(this.entries.values());
    if (sessionId) entries = entries.filter(e => e.sessionId === sessionId);
    
    return entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ embedding: _, ...rest }) => rest);
  }

  async getByType(type: MemoryEntry["type"]): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    
    return Array.from(this.entries.values())
      .filter(e => e.type === type)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ embedding: _, ...rest }) => rest);
  }

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

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.entries.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

let vectorMemoryInstance: VectorMemoryStore | null = null;

export function getVectorMemory(): VectorMemoryStore {
  if (!vectorMemoryInstance) vectorMemoryInstance = new VectorMemoryStore();
  return vectorMemoryInstance;
}
