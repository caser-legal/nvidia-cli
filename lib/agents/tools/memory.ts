// Agent Memory System
// Unified memory - no artificial short/long separation

import * as fs from "fs/promises";
import * as path from "path";
import { BaseTool } from "../base-tool";

export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: "fact" | "context" | "decision" | "entity" | "task";
  content: string;
  metadata?: Record<string, unknown>;
}

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/tmp";
const MEMORY_DIR = path.join(HOME_DIR, ".nvidia-cli", "memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "long-term.json");

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// Normalize content for comparison (lowercase, trim, remove extra spaces)
function normalizeContent(content: string): string {
  return content.toLowerCase().trim().replace(/\s+/g, " ");
}

// Check if two contents are semantically similar
function isSimilar(a: string, b: string): boolean {
  const normA = normalizeContent(a);
  const normB = normalizeContent(b);
  
  // Exact match after normalization
  if (normA === normB) return true;
  
  // One contains the other (handles slight variations)
  if (normA.includes(normB) || normB.includes(normA)) return true;
  
  return false;
}

// Unified Memory class - single source of truth
export class UnifiedMemory {
  private memories: MemoryEntry[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      const data = await fs.readFile(MEMORY_FILE, "utf-8");
      this.memories = JSON.parse(data);
    } catch {
      this.memories = [];
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    await fs.writeFile(MEMORY_FILE, JSON.stringify(this.memories, null, 2));
  }

  async add(type: MemoryEntry["type"], content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry | null> {
    await this.load();
    
    // Check for duplicates before adding
    const isDuplicate = this.memories.some(m => isSimilar(m.content, content));
    if (isDuplicate) {
      return null; // Already exists
    }
    
    const entry: MemoryEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata,
    };
    
    this.memories.push(entry);
    await this.save();
    return entry;
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.load();
    return this.memories;
  }

  async search(query: string): Promise<MemoryEntry[]> {
    await this.load();
    const queryLower = query.toLowerCase();
    return this.memories.filter(e => 
      e.content.toLowerCase().includes(queryLower)
    );
  }

  async getByType(type: MemoryEntry["type"]): Promise<MemoryEntry[]> {
    await this.load();
    return this.memories.filter(e => e.type === type);
  }

  async getRecent(count: number = 10): Promise<MemoryEntry[]> {
    await this.load();
    return this.memories.slice(-count);
  }

  async delete(id: string): Promise<boolean> {
    await this.load();
    const idx = this.memories.findIndex(e => e.id === id);
    if (idx >= 0) {
      this.memories.splice(idx, 1);
      await this.save();
      return true;
    }
    return false;
  }

  async deleteByContent(query: string): Promise<number> {
    await this.load();
    const queryLower = query.toLowerCase();
    const before = this.memories.length;
    this.memories = this.memories.filter(e => 
      !e.content.toLowerCase().includes(queryLower)
    );
    const deleted = before - this.memories.length;
    if (deleted > 0) await this.save();
    return deleted;
  }

  async clear(): Promise<void> {
    this.memories = [];
    await this.save();
  }
}

// Memory Tool - unified interface
export class MemoryTool extends BaseTool {
  name = "memory";
  description = `Store and retrieve information from memory.
Operations:
- remember: Store a fact, decision, or entity (auto-deduplicates)
- recall: Search memory for relevant information
- list: List recent memories (shows IDs for deletion)
- delete: Remove a memory by ID or search term
- summarize: Get memory summary
- clear: Clear all memory`;

  parameters = {
    operation: {
      type: "string",
      enum: ["remember", "recall", "list", "summarize", "promote", "delete", "clear"],
      description: "Memory operation",
    },
    content: {
      type: "string",
      description: "Content to remember, search query, or memory ID to delete",
      optional: true,
    },
    type: {
      type: "string",
      enum: ["fact", "context", "decision", "entity", "task"],
      description: "Type of memory entry",
      optional: true,
    },
    storage: {
      type: "string",
      enum: ["short", "long"],
      description: "Memory storage (default: short)",
      optional: true,
    },
  };

  private memory: UnifiedMemory;

  constructor(sessionId?: string) {
    super();
    this.memory = new UnifiedMemory();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const content = args.content as string;
    const type = (args.type as MemoryEntry["type"]) || "fact";

    try {
      switch (operation) {
        case "remember":
          if (!content) return "Error: content required";
          const entry = await this.memory.add(type, content);
          if (entry) {
            return `Stored in memory: ${entry.id}`;
          } else {
            return `Already in memory (duplicate detected)`;
          }

        case "recall":
          if (!content) return "Error: search query required";
          const results = await this.memory.search(content);
          if (results.length === 0) return "No memories found matching query";
          return `## Recalled Memories (${results.length})\n\n` + 
            results.map(m => `- [${m.type}] ${m.content} (id: ${m.id})`).join("\n");

        case "list":
          const recent = await this.memory.getRecent(20);
          if (recent.length === 0) return "No memories stored";
          return `## Recent Memories\n\n` +
            recent.map(m => `- [${m.type}] ${m.content} (id: ${m.id})`).join("\n");

        case "delete":
          if (!content) return "Error: memory ID or search term required";
          // Try by ID first
          if (content.startsWith("mem-")) {
            const deleted = await this.memory.delete(content);
            return deleted ? `Deleted memory: ${content}` : `Memory not found: ${content}`;
          }
          // Otherwise delete by content match
          const count = await this.memory.deleteByContent(content);
          return count > 0 ? `Deleted ${count} memory(s) matching "${content}"` : `No memories found matching "${content}"`;

        case "summarize":
          const all = await this.memory.getAll();
          const facts = all.filter(m => m.type === "fact");
          const decisions = all.filter(m => m.type === "decision");
          const entities = all.filter(m => m.type === "entity");
          
          return `## Memory Summary (${all.length} total)

**Facts (${facts.length}):**
${facts.map(f => `- ${f.content}`).join("\n") || "None"}

**Decisions (${decisions.length}):**
${decisions.map(d => `- ${d.content}`).join("\n") || "None"}

**Entities (${entities.length}):**
${entities.map(e => `- ${e.content}`).join("\n") || "None"}`;

        case "promote":
          return "Memory is unified - no promotion needed";

        case "clear":
          await this.memory.clear();
          return "Memory cleared";

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Entity Memory - uses same unified storage
export class EntityMemoryTool extends BaseTool {
  name = "entity_memory";
  description = `Track and recall information about named entities (people, projects, companies).`;

  parameters = {
    operation: {
      type: "string",
      enum: ["add", "get", "list", "update"],
      description: "Entity operation",
    },
    entity_name: {
      type: "string",
      description: "Name of the entity",
    },
    entity_type: {
      type: "string",
      enum: ["person", "project", "company", "technology", "other"],
      description: "Type of entity",
      optional: true,
    },
    info: {
      type: "string",
      description: "Information about the entity",
      optional: true,
    },
  };

  private memory: UnifiedMemory;

  constructor() {
    super();
    this.memory = new UnifiedMemory();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const entityName = args.entity_name as string;
    const entityType = (args.entity_type as string) || "other";
    const info = args.info as string;

    try {
      switch (operation) {
        case "add":
          if (!entityName || !info) return "Error: entity_name and info required";
          const entry = await this.memory.add("entity", `${entityName}: ${info}`, { entityName, entityType });
          return entry ? `Added info about ${entityName}` : `Info about ${entityName} already exists`;

        case "get":
          if (!entityName) return "Error: entity_name required";
          const results = await this.memory.search(entityName);
          const entityResults = results.filter(r => r.type === "entity");
          if (entityResults.length === 0) return `No information found about ${entityName}`;
          return `## ${entityName}\n\n` +
            entityResults.map(r => `- ${r.content.replace(`${entityName}: `, "")}`).join("\n");

        case "list":
          const all = await this.memory.getByType("entity");
          const entities = new Set(all.map(e => e.metadata?.entityName as string).filter(Boolean));
          return `## Known Entities (${entities.size})\n\n` +
            [...entities].map(e => `- ${e}`).join("\n");

        case "update":
          if (!entityName || !info) return "Error: entity_name and info required";
          await this.memory.add("entity", `${entityName}: ${info}`, { entityName, entityType });
          return `Updated info about ${entityName}`;

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
