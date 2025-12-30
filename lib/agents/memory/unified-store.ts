/**
 * Unified Memory Store
 * SINGLE source of truth for all memory - consolidates tools/memory.ts and memory/vector-memory.ts
 * Uses vector embeddings for semantic search with JSON file fallback
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createLogger } from "../../logger";

const log = createLogger("UnifiedMemoryStore");

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/tmp";
const MEMORY_DIR = path.join(HOME_DIR, ".nvidia-cli", "memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "unified-memory.json");

export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: "fact" | "context" | "decision" | "entity" | "task" | "conversation" | "rule";
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

// Simple embedding using character n-grams (no external API dependency)
function simpleEmbed(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Create a 256-dimensional vector from word hashes
  const vector = new Array(256).fill(0);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % 256;
    vector[idx] += 1;
  }
  
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

class UnifiedMemoryStoreImpl {
  private entries: Map<string, MemoryEntry> = new Map();
  private loaded = false;
  private dirty = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      const data = await fs.readFile(MEMORY_FILE, "utf-8");
      const parsed = JSON.parse(data) as MemoryEntry[];
      for (const entry of parsed) {
        this.entries.set(entry.id, entry);
      }
      log.info(`Loaded ${this.entries.size} memories`);
    } catch {
      // Start fresh
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const data = Array.from(this.entries.values());
    await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
    this.dirty = false;
  }

  async add(
    type: MemoryEntry["type"],
    content: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry | null> {
    await this.ensureLoaded();
    
    // Deduplicate by content similarity
    const newEmbed = simpleEmbed(content);
    for (const existing of this.entries.values()) {
      if (existing.embedding) {
        const sim = cosineSimilarity(newEmbed, existing.embedding);
        if (sim > 0.95) {
          log.debug("Duplicate memory detected, skipping");
          return null;
        }
      }
    }
    
    const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const entry: MemoryEntry = {
      id,
      timestamp: new Date().toISOString(),
      type,
      content,
      sessionId,
      metadata,
      embedding: newEmbed,
    };
    
    this.entries.set(id, entry);
    this.dirty = true;
    await this.save();
    
    return entry;
  }

  async search(query: string, topK: number = 10, sessionId?: string): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    if (this.entries.size === 0) return [];
    
    const queryEmbed = simpleEmbed(query);
    const scored: { entry: MemoryEntry; score: number }[] = [];
    
    for (const entry of this.entries.values()) {
      if (sessionId && entry.sessionId && entry.sessionId !== sessionId) continue;
      
      const score = entry.embedding 
        ? cosineSimilarity(queryEmbed, entry.embedding)
        : (entry.content.toLowerCase().includes(query.toLowerCase()) ? 0.5 : 0);
      
      if (score > 0.1) {
        scored.push({ entry, score });
      }
    }
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ entry, score }) => ({
        ...entry,
        embedding: undefined, // Don't return embeddings
        metadata: { ...entry.metadata, score },
      }));
  }

  async getByType(type: MemoryEntry["type"]): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    return Array.from(this.entries.values())
      .filter(e => e.type === type)
      .map(({ embedding: _, ...rest }) => rest);
  }

  async getRecent(count: number = 20): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    return Array.from(this.entries.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count)
      .map(({ embedding: _, ...rest }) => rest);
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    return Array.from(this.entries.values())
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

  async deleteByContent(query: string): Promise<number> {
    await this.ensureLoaded();
    const queryLower = query.toLowerCase();
    let count = 0;
    
    for (const [id, entry] of this.entries) {
      if (entry.content.toLowerCase().includes(queryLower)) {
        this.entries.delete(id);
        count++;
      }
    }
    
    if (count > 0) {
      this.dirty = true;
      await this.save();
    }
    return count;
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
}

// Singleton
let instance: UnifiedMemoryStoreImpl | null = null;

export function getUnifiedMemory(): UnifiedMemoryStoreImpl {
  if (!instance) {
    instance = new UnifiedMemoryStoreImpl();
  }
  return instance;
}

export function resetUnifiedMemory(): void {
  instance = null;
}

// Also export as VectorMemoryStore for backward compatibility
export { UnifiedMemoryStoreImpl as VectorMemoryStore };
export const getVectorMemory = getUnifiedMemory;
