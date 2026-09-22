import * as os from "os";
#!/usr/bin/env npx tsx
/**
 * Memory Migration Script
 * Migrates orphaned memory from long-term.json and vector-memory.json to unified-memory.json
 * 
 * Run: npx tsx scripts/migrate-memory.ts
 */

import * as fs from "fs/promises";
import * as path from "path";

const HOME_DIR = process.env.HOME || os.homedir();
const MEMORY_DIR = path.join(HOME_DIR, ".nvidia-cli", "memory");

interface OldMemoryEntry {
  id: string;
  timestamp: string;
  type: string;
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

interface VectorMemoryEntry extends OldMemoryEntry {
  embedding: number[];
}

interface UnifiedMemoryEntry {
  id: string;
  timestamp: string;
  type: "fact" | "context" | "decision" | "entity" | "task" | "conversation" | "rule";
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

// Simple embedding using character n-grams (matches unified-store.ts)
function simpleEmbed(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
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
  
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

function normalizeType(type: string): UnifiedMemoryEntry["type"] {
  const validTypes = ["fact", "context", "decision", "entity", "task", "conversation", "rule"];
  if (validTypes.includes(type)) {
    return type as UnifiedMemoryEntry["type"];
  }
  return "fact";
}

async function migrate() {
  console.log("=== Memory Migration Script ===\n");
  
  const longTermPath = path.join(MEMORY_DIR, "long-term.json");
  const vectorPath = path.join(MEMORY_DIR, "vector-memory.json");
  const unifiedPath = path.join(MEMORY_DIR, "unified-memory.json");
  const backupDir = path.join(MEMORY_DIR, "backup");
  
  // Create backup directory
  await fs.mkdir(backupDir, { recursive: true });
  
  // Load existing unified memory
  let unifiedEntries: Map<string, UnifiedMemoryEntry> = new Map();
  try {
    const unifiedData = await fs.readFile(unifiedPath, "utf-8");
    const parsed = JSON.parse(unifiedData) as UnifiedMemoryEntry[];
    for (const entry of parsed) {
      unifiedEntries.set(entry.id, entry);
    }
    console.log(`Loaded ${unifiedEntries.size} existing unified entries`);
  } catch {
    console.log("No existing unified-memory.json, starting fresh");
  }
  
  // Load and migrate long-term.json
  let longTermCount = 0;
  try {
    const longTermData = await fs.readFile(longTermPath, "utf-8");
    const longTermEntries = JSON.parse(longTermData) as OldMemoryEntry[];
    console.log(`Found ${longTermEntries.length} entries in long-term.json`);
    
    for (const entry of longTermEntries) {
      if (!unifiedEntries.has(entry.id)) {
        const unified: UnifiedMemoryEntry = {
          id: entry.id,
          timestamp: entry.timestamp,
          type: normalizeType(entry.type),
          content: entry.content,
          sessionId: entry.sessionId,
          metadata: entry.metadata,
          embedding: simpleEmbed(entry.content),
        };
        unifiedEntries.set(entry.id, unified);
        longTermCount++;
      }
    }
    
    // Backup original
    await fs.copyFile(longTermPath, path.join(backupDir, `long-term.json.${Date.now()}.bak`));
    console.log(`Migrated ${longTermCount} entries from long-term.json`);
  } catch (e) {
    console.log(`No long-term.json to migrate: ${e}`);
  }
  
  // Load and migrate vector-memory.json
  let vectorCount = 0;
  try {
    const vectorData = await fs.readFile(vectorPath, "utf-8");
    const vectorEntries = JSON.parse(vectorData) as VectorMemoryEntry[];
    console.log(`Found ${vectorEntries.length} entries in vector-memory.json`);
    
    for (const entry of vectorEntries) {
      if (!unifiedEntries.has(entry.id)) {
        const unified: UnifiedMemoryEntry = {
          id: entry.id,
          timestamp: entry.timestamp,
          type: normalizeType(entry.type),
          content: entry.content,
          sessionId: entry.sessionId,
          metadata: entry.metadata,
          embedding: entry.embedding || simpleEmbed(entry.content),
        };
        unifiedEntries.set(entry.id, unified);
        vectorCount++;
      }
    }
    
    // Backup original
    await fs.copyFile(vectorPath, path.join(backupDir, `vector-memory.json.${Date.now()}.bak`));
    console.log(`Migrated ${vectorCount} entries from vector-memory.json`);
  } catch (e) {
    console.log(`No vector-memory.json to migrate: ${e}`);
  }
  
  // Write unified memory
  const allEntries = Array.from(unifiedEntries.values());
  await fs.writeFile(unifiedPath, JSON.stringify(allEntries, null, 2));
  
  console.log(`\n=== Migration Complete ===`);
  console.log(`Total unified entries: ${allEntries.length}`);
  console.log(`  - From long-term.json: ${longTermCount}`);
  console.log(`  - From vector-memory.json: ${vectorCount}`);
  console.log(`  - Previously in unified: ${allEntries.length - longTermCount - vectorCount}`);
  console.log(`\nBackups saved to: ${backupDir}`);
  console.log(`\nYou can now safely delete the old files:`);
  console.log(`  rm ${longTermPath}`);
  console.log(`  rm ${vectorPath}`);
}

migrate().catch(console.error);
