// Agent Memory System
// Uses UNIFIED memory store - single source of truth

import { BaseTool } from "../base-tool";
import { getUnifiedMemory, MemoryEntry } from "../memory";

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
      enum: ["fact", "context", "decision", "entity", "task", "rule"],
      description: "Type of memory entry",
      optional: true,
    },
    storage: {
      type: "string",
      enum: ["short", "long"],
      description: "Ignored - memory is unified",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const content = args.content as string;
    const type = (args.type as MemoryEntry["type"]) || "fact";
    const memory = getUnifiedMemory();

    try {
      switch (operation) {
        case "remember":
          if (!content) return "Error: content required";
          const entry = await memory.add(type, content);
          if (entry) {
            return `Stored in memory: ${entry.id}`;
          } else {
            return `Already in memory (duplicate detected)`;
          }

        case "recall":
          if (!content) return "Error: search query required";
          const results = await memory.search(content);
          if (results.length === 0) return "No memories found matching query";
          return `## Recalled Memories (${results.length})\n\n` + 
            results.map(m => `- [${m.type}] ${m.content} (id: ${m.id})`).join("\n");

        case "list":
          const recent = await memory.getRecent(20);
          if (recent.length === 0) return "No memories stored";
          return `## Recent Memories\n\n` +
            recent.map(m => `- [${m.type}] ${m.content} (id: ${m.id})`).join("\n");

        case "delete":
          if (!content) return "Error: memory ID or search term required";
          if (content.startsWith("mem-")) {
            const deleted = await memory.delete(content);
            return deleted ? `Deleted memory: ${content}` : `Memory not found: ${content}`;
          }
          const count = await memory.deleteByContent(content);
          return count > 0 ? `Deleted ${count} memory(s) matching "${content}"` : `No memories found matching "${content}"`;

        case "summarize":
          const all = await memory.getAll();
          const facts = all.filter(m => m.type === "fact");
          const decisions = all.filter(m => m.type === "decision");
          const entities = all.filter(m => m.type === "entity");
          const rules = all.filter(m => m.type === "rule");
          
          return `## Memory Summary (${all.length} total)

**Rules (${rules.length}):**
${rules.map(r => `- ${r.content}`).join("\n") || "None"}

**Facts (${facts.length}):**
${facts.map(f => `- ${f.content}`).join("\n") || "None"}

**Decisions (${decisions.length}):**
${decisions.map(d => `- ${d.content}`).join("\n") || "None"}

**Entities (${entities.length}):**
${entities.map(e => `- ${e.content}`).join("\n") || "None"}`;

        case "promote":
          return "Memory is unified - no promotion needed";

        case "clear":
          await memory.clear();
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

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const entityName = args.entity_name as string;
    const entityType = (args.entity_type as string) || "other";
    const info = args.info as string;
    const memory = getUnifiedMemory();

    try {
      switch (operation) {
        case "add":
          if (!entityName || !info) return "Error: entity_name and info required";
          const entry = await memory.add("entity", `${entityName}: ${info}`, undefined, { entityName, entityType });
          return entry ? `Added info about ${entityName}` : `Info about ${entityName} already exists`;

        case "get":
          if (!entityName) return "Error: entity_name required";
          const results = await memory.search(entityName);
          const entityResults = results.filter(r => r.type === "entity");
          if (entityResults.length === 0) return `No information found about ${entityName}`;
          return `## ${entityName}\n\n` +
            entityResults.map(r => `- ${r.content.replace(`${entityName}: `, "")}`).join("\n");

        case "list":
          const all = await memory.getByType("entity");
          const entities = new Set(all.map(e => {
            const match = e.content.match(/^([^:]+):/);
            return match ? match[1] : e.content;
          }));
          return `## Known Entities (${entities.size})\n\n` +
            [...entities].map(e => `- ${e}`).join("\n");

        case "update":
          if (!entityName || !info) return "Error: entity_name and info required";
          await memory.add("entity", `${entityName}: ${info}`, undefined, { entityName, entityType });
          return `Updated info about ${entityName}`;

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Re-export MemoryEntry type
export type { MemoryEntry };
