/**
 * Unified Memory Tool
 * Based on NVIDIA RAG Blueprint multi-turn conversation pattern
 * 
 * All memories are stored in a vector database with semantic retrieval.
 * No distinction between short-term and long-term - everything persists.
 */

import { BaseTool } from "../base-tool";
import { getVectorMemory, type MemoryEntry } from "../memory";

export class UnifiedMemoryTool extends BaseTool {
  name = "memory";
  description = `Store and retrieve information using semantic memory.
All memories persist across sessions and are retrieved via semantic search.

Operations:
- remember: Store a fact, decision, entity, or context
- recall: Semantic search for relevant memories
- list: List recent memories
- clear: Clear memories (optionally for current session only)`;

  parameters = {
    operation: {
      type: "string",
      enum: ["remember", "recall", "list", "clear"],
      description: "Memory operation",
    },
    content: {
      type: "string",
      description: "Content to remember or search query",
      optional: true,
    },
    type: {
      type: "string",
      enum: ["fact", "context", "decision", "entity", "task", "conversation"],
      description: "Type of memory entry (default: fact)",
      optional: true,
    },
    limit: {
      type: "number",
      description: "Max results to return (default: 10)",
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
    const limit = (args.limit as number) || 10;

    const memory = getVectorMemory();

    try {
      switch (operation) {
        case "remember":
          if (!content) return "Error: content required";
          const entry = await memory.add(type, content, this.sessionId);
          return `Stored in memory: ${entry.id} (${type})`;

        case "recall":
          if (!content) return "Error: search query required";
          const results = await memory.search(content, limit);
          
          if (results.length === 0) return "No relevant memories found";
          
          return `## Recalled Memories (${results.length})\n\n` + 
            results.map(m => {
              const score = (m.metadata?.score as number)?.toFixed(3) || "?";
              return `- [${m.type}] (${score}) ${m.content}`;
            }).join("\n");

        case "list":
          const recent = await memory.getRecent(limit, this.sessionId);
          const total = await memory.count();
          
          if (recent.length === 0) return "No memories stored";
          
          return `## Recent Memories (${recent.length} of ${total} total)\n\n` +
            recent.map(m => `- [${m.type}] ${m.content}`).join("\n");

        case "clear":
          const cleared = await memory.clear(this.sessionId);
          return `Cleared ${cleared} memories`;

        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
