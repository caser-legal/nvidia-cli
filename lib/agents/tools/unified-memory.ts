/**
 * Unified Memory Tool
 * Based on NVIDIA RAG Blueprint multi-turn conversation pattern
 * Uses the unified memory store
 */

import { BaseTool } from "../base-tool";
import { getUnifiedMemory, type MemoryEntry } from "../memory";

export class UnifiedMemoryTool extends BaseTool {
  name = "unified_memory";
  description = `Store and retrieve information using semantic memory.
All memories persist across sessions and are retrieved via semantic search.

Operations:
- store: Store a fact, decision, entity, or context
- recall: Semantic search for relevant memories
- context: Get context for current task`;

  parameters = {
    operation: {
      type: "string",
      enum: ["store", "recall", "context"],
      description: "Memory operation",
    },
    content: {
      type: "string",
      description: "Content to store or search query",
      optional: true,
    },
    type: {
      type: "string",
      enum: ["fact", "context", "decision", "entity", "task", "rule"],
      description: "Type of memory entry (default: fact)",
      optional: true,
    },
  };

  private sessionId?: string;

  constructor(sessionId?: string) {
    super();
    this.sessionId = sessionId;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const content = args.content as string;
    const type = (args.type as MemoryEntry["type"]) || "fact";

    const memory = getUnifiedMemory();

    try {
      switch (operation) {
        case "store":
          if (!content) return "Error: content required";
          const entry = await memory.add(type, content, this.sessionId);
          if (entry) {
            return `Stored in memory: ${entry.id} (${type})`;
          }
          return "Already in memory (duplicate detected)";

        case "recall":
          if (!content) return "Error: search query required";
          const results = await memory.search(content, 10);
          
          if (results.length === 0) return "No relevant memories found";
          
          return `## Recalled Memories (${results.length})\n\n` + 
            results.map(m => {
              const score = (m.metadata?.score as number)?.toFixed(3) || "?";
              return `- [${m.type}] (${score}) ${m.content}`;
            }).join("\n");

        case "context":
          const recent = await memory.getRecent(20);
          const rules = recent.filter(m => m.type === "rule");
          const facts = recent.filter(m => m.type === "fact");
          const entities = recent.filter(m => m.type === "entity");
          
          const sections: string[] = [];
          
          if (rules.length > 0) {
            sections.push(`### Rules\n${rules.map(r => `- ${r.content}`).join("\n")}`);
          }
          if (entities.length > 0) {
            sections.push(`### Entities\n${entities.map(e => `- ${e.content}`).join("\n")}`);
          }
          if (facts.length > 0) {
            sections.push(`### Facts\n${facts.map(f => `- ${f.content}`).join("\n")}`);
          }
          
          return sections.length > 0 ? sections.join("\n\n") : "No context available";

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
