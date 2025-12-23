// Agent Memory System
// Short-term (session) and Long-term (file-based) memory for agents

import * as fs from "fs/promises";
import * as path from "path";
import { BaseTool } from "../base-tool";

// Memory types
export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: "fact" | "context" | "decision" | "entity" | "task";
  content: string;
  metadata?: Record<string, unknown>;
  relevance?: number;
}

export interface ConversationSummary {
  topics: string[];
  keyFacts: string[];
  decisions: string[];
  entities: string[];
  lastUpdated: string;
}

// In-memory short-term storage
const shortTermMemory: Map<string, MemoryEntry[]> = new Map();
const conversationSummaries: Map<string, ConversationSummary> = new Map();

// Long-term memory file path - use home directory
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/tmp";
const MEMORY_DIR = path.join(HOME_DIR, ".nvidia-cli", "memory");
const LONG_TERM_FILE = path.join(MEMORY_DIR, "long-term.json");

// Generate unique ID
function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// Short-term memory class
export class ShortTermMemory {
  private sessionId: string;

  constructor(sessionId: string = "default") {
    this.sessionId = sessionId;
    if (!shortTermMemory.has(sessionId)) {
      shortTermMemory.set(sessionId, []);
    }
  }

  add(type: MemoryEntry["type"], content: string, metadata?: Record<string, unknown>): MemoryEntry {
    const entry: MemoryEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata,
    };
    shortTermMemory.get(this.sessionId)!.push(entry);
    return entry;
  }

  getAll(): MemoryEntry[] {
    return shortTermMemory.get(this.sessionId) || [];
  }

  getByType(type: MemoryEntry["type"]): MemoryEntry[] {
    return this.getAll().filter(e => e.type === type);
  }

  search(query: string): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    return this.getAll().filter(e => 
      e.content.toLowerCase().includes(queryLower)
    );
  }

  getRecent(count: number = 10): MemoryEntry[] {
    return this.getAll().slice(-count);
  }

  clear(): void {
    shortTermMemory.set(this.sessionId, []);
  }

  // Summarize conversation for context compression
  summarize(): ConversationSummary {
    const entries = this.getAll();
    const summary: ConversationSummary = {
      topics: [],
      keyFacts: [],
      decisions: [],
      entities: [],
      lastUpdated: new Date().toISOString(),
    };

    for (const entry of entries) {
      switch (entry.type) {
        case "fact":
          summary.keyFacts.push(entry.content);
          break;
        case "decision":
          summary.decisions.push(entry.content);
          break;
        case "entity":
          summary.entities.push(entry.content);
          break;
        case "context":
          summary.topics.push(entry.content);
          break;
      }
    }

    // Deduplicate
    summary.topics = [...new Set(summary.topics)].slice(0, 10);
    summary.keyFacts = [...new Set(summary.keyFacts)].slice(0, 20);
    summary.decisions = [...new Set(summary.decisions)].slice(0, 10);
    summary.entities = [...new Set(summary.entities)].slice(0, 20);

    conversationSummaries.set(this.sessionId, summary);
    return summary;
  }

  getSummary(): ConversationSummary | undefined {
    return conversationSummaries.get(this.sessionId);
  }
}

// Long-term memory class (file-based persistence)
export class LongTermMemory {
  private memories: MemoryEntry[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      const data = await fs.readFile(LONG_TERM_FILE, "utf-8");
      this.memories = JSON.parse(data);
    } catch {
      this.memories = [];
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    await fs.writeFile(LONG_TERM_FILE, JSON.stringify(this.memories, null, 2));
  }

  async add(type: MemoryEntry["type"], content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry> {
    await this.load();
    
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

  async clear(): Promise<void> {
    this.memories = [];
    await this.save();
  }

  // Promote short-term memories to long-term
  async promoteFromShortTerm(shortTerm: ShortTermMemory, types?: MemoryEntry["type"][]): Promise<number> {
    await this.load();
    
    const entries = types 
      ? shortTerm.getAll().filter(e => types.includes(e.type))
      : shortTerm.getAll();
    
    for (const entry of entries) {
      // Avoid duplicates
      const exists = this.memories.some(m => m.content === entry.content);
      if (!exists) {
        this.memories.push({ ...entry, id: generateId() });
      }
    }
    
    await this.save();
    return entries.length;
  }
}

// Memory Tool for agent use
export class MemoryTool extends BaseTool {
  name = "memory";
  description = `Store and retrieve information from memory.
Operations:
- remember: Store a fact, decision, or entity
- recall: Search memory for relevant information
- list: List recent memories
- summarize: Get conversation summary
- promote: Save important memories to long-term storage
- clear: Clear short-term memory`;

  parameters = {
    operation: {
      type: "string",
      enum: ["remember", "recall", "list", "summarize", "promote", "clear"],
      description: "Memory operation",
    },
    content: {
      type: "string",
      description: "Content to remember or search query",
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

  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;

  constructor(sessionId?: string) {
    super();
    this.shortTerm = new ShortTermMemory(sessionId);
    this.longTerm = new LongTermMemory();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const content = args.content as string;
    const type = (args.type as MemoryEntry["type"]) || "fact";
    const storage = (args.storage as string) || "short";

    try {
      switch (operation) {
        case "remember":
          if (!content) return "Error: content required";
          if (storage === "long") {
            const entry = await this.longTerm.add(type, content);
            return `Stored in long-term memory: ${entry.id}`;
          } else {
            const entry = this.shortTerm.add(type, content);
            return `Stored in short-term memory: ${entry.id}`;
          }

        case "recall":
          if (!content) return "Error: search query required";
          const shortResults = this.shortTerm.search(content);
          const longResults = await this.longTerm.search(content);
          const all = [...shortResults, ...longResults];
          
          if (all.length === 0) return "No memories found matching query";
          
          return `## Recalled Memories (${all.length})\n\n` + 
            all.map(m => `- [${m.type}] ${m.content}`).join("\n");

        case "list":
          const recent = this.shortTerm.getRecent(20);
          if (recent.length === 0) return "No memories in current session";
          
          return `## Recent Memories\n\n` +
            recent.map(m => `- [${m.type}] ${m.content}`).join("\n");

        case "summarize":
          const summary = this.shortTerm.summarize();
          return `## Conversation Summary

**Topics:** ${summary.topics.join(", ") || "None"}

**Key Facts:**
${summary.keyFacts.map(f => `- ${f}`).join("\n") || "None"}

**Decisions:**
${summary.decisions.map(d => `- ${d}`).join("\n") || "None"}

**Entities:**
${summary.entities.join(", ") || "None"}`;

        case "promote":
          const count = await this.longTerm.promoteFromShortTerm(
            this.shortTerm, 
            ["fact", "decision", "entity"]
          );
          return `Promoted ${count} memories to long-term storage`;

        case "clear":
          this.shortTerm.clear();
          return "Short-term memory cleared";

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Entity Memory - tracks named entities across conversations
export class EntityMemoryTool extends BaseTool {
  name = "entity_memory";
  description = `Track and recall information about named entities (people, projects, companies).
Automatically extracts and stores entity information.`;

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

  private longTerm: LongTermMemory;

  constructor() {
    super();
    this.longTerm = new LongTermMemory();
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
          await this.longTerm.add("entity", `${entityName}: ${info}`, {
            entityName,
            entityType,
          });
          return `Added info about ${entityName}`;

        case "get":
          if (!entityName) return "Error: entity_name required";
          const results = await this.longTerm.search(entityName);
          const entityResults = results.filter(r => r.type === "entity");
          
          if (entityResults.length === 0) return `No information found about ${entityName}`;
          
          return `## ${entityName}\n\n` +
            entityResults.map(r => `- ${r.content.replace(`${entityName}: `, "")}`).join("\n");

        case "list":
          const all = await this.longTerm.getByType("entity");
          const entities = new Set(all.map(e => e.metadata?.entityName as string).filter(Boolean));
          
          return `## Known Entities (${entities.size})\n\n` +
            [...entities].map(e => `- ${e}`).join("\n");

        case "update":
          if (!entityName || !info) return "Error: entity_name and info required";
          await this.longTerm.add("entity", `${entityName}: ${info}`, {
            entityName,
            entityType,
          });
          return `Updated info about ${entityName}`;

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
