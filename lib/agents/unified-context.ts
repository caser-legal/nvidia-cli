/**
 * Unified Context Layer
 * Aggregates context from RAG, Memory, and Data Flywheel systems
 * ALL sources are queried - no optional bypassing
 */

import { RAGPipelineV2 } from "./rag/pipeline-v2";
import { Document } from "./rag/types";
import { getUnifiedMemory, MemoryEntry } from "./memory";
import { FlywheelLogger } from "./flywheel/logger";
import { FlywheelRecord } from "./flywheel/types";
import { RetrievalRouter, RetrievalSource } from "./retrieval-router";
import { createLogger } from "../logger";

const log = createLogger("UnifiedContext");

export interface UnifiedContextQuery {
  query: string;
  includeRAG?: boolean;
  includeMemory?: boolean;
  includeFlywheel?: boolean;
  limit?: number;
}

export interface UnifiedContextResult {
  ragDocuments: Document[];
  memories: MemoryEntry[];
  entities: MemoryEntry[];
  flywheelExamples: FlywheelRecord[];
  formattedContext: string;
}

export class UnifiedContext {
  constructor(
    private rag: RAGPipelineV2,
    private flywheel: FlywheelLogger,
    private router: RetrievalRouter,
  ) {}

  /**
   * Retrieve unified context from ALL available sources
   * This is ALWAYS called before agent processing
   */
  async retrieve(params: UnifiedContextQuery): Promise<UnifiedContextResult> {
    const { query, limit = 5 } = params;
    let { includeRAG, includeMemory, includeFlywheel } = params;

    // Use router to determine sources if not explicitly specified
    if (includeRAG === undefined || includeMemory === undefined) {
      try {
        const plan = await this.router.route(query);
        if (includeRAG === undefined) {
          includeRAG = plan.source === RetrievalSource.RAG || plan.source === RetrievalSource.HYBRID;
        }
        if (includeMemory === undefined) {
          includeMemory = plan.source === RetrievalSource.MEMORY || plan.source === RetrievalSource.HYBRID;
        }
      } catch {
        // Default to hybrid on error
        includeRAG = true;
        includeMemory = true;
      }
    }
    
    // Default flywheel to true
    if (includeFlywheel === undefined) {
      includeFlywheel = true;
    }

    // Get unified memory instance (SINGLE source of truth)
    const memory = getUnifiedMemory();

    // Parallel retrieval from ALL sources
    const [ragDocs, memories] = await Promise.all([
      includeRAG ? this.rag.search(query).then(res => res.documents).catch((e) => {
        log.debug("RAG search failed", { error: String(e) });
        return [];
      }) : [],
      includeMemory ? memory.search(query, limit).catch((e) => {
        log.debug("Memory search failed", { error: String(e) });
        return [];
      }) : [],
    ]);

    // Filter entities from memories
    const entities = memories.filter(m => m.type === "entity");
    const rules = memories.filter(m => m.type === "rule");
    const nonEntityMemories = memories.filter(m => m.type !== "entity" && m.type !== "rule");

    // Flywheel: Get high-quality examples for few-shot learning
    let flywheelExamples: FlywheelRecord[] = [];
    if (includeFlywheel) {
      try {
        const allHighQuality = this.flywheel.getHighQualityRecords(4);
        const queryLower = query.toLowerCase();
        
        // Semantic matching on user messages
        flywheelExamples = allHighQuality
          .filter(r => {
            const msgLower = r.userMessage.toLowerCase();
            // Check for keyword overlap
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
            return queryWords.some(word => msgLower.includes(word));
          })
          .slice(0, 3);
      } catch (e) {
        log.debug("Flywheel retrieval failed", { error: String(e) });
      }
    }

    const result: UnifiedContextResult = {
      ragDocuments: ragDocs.slice(0, limit),
      memories: nonEntityMemories.slice(0, limit),
      entities: entities.slice(0, limit),
      flywheelExamples,
      formattedContext: ""
    };

    result.formattedContext = this.formatContext(result, rules);
    
    log.debug("Unified context retrieved", {
      ragDocs: result.ragDocuments.length,
      memories: result.memories.length,
      entities: result.entities.length,
      flywheel: result.flywheelExamples.length,
    });
    
    return result;
  }

  private formatContext(result: UnifiedContextResult, rules: MemoryEntry[]): string {
    const sections: string[] = [];

    // Priority header
    sections.push(`### CONTEXT ARBITRATION
1. **RULES**: User rules - HIGHEST priority, must be followed
2. **FACTS**: RAG documents - objective truth
3. **USER CONTEXT**: Memories - user preferences
4. **EXAMPLES**: Flywheel - style/format guidance`);

    // Rules first (highest priority)
    if (rules.length > 0) {
      sections.push(`### RULES (MANDATORY)\n${rules.map(r => `- ${r.content}`).join("\n")}`);
    }

    // Entities
    if (result.entities.length > 0) {
      sections.push(`### ENTITIES\n${result.entities.map(e => `- ${e.content}`).join("\n")}`);
    }

    // Memories
    if (result.memories.length > 0) {
      sections.push(`### MEMORIES\n${result.memories.map(m => `- [${m.type}] ${m.content}`).join("\n")}`);
    }

    // RAG documents
    if (result.ragDocuments.length > 0) {
      sections.push(`### FACTS\n${result.ragDocuments.map((d, i) => `[${i+1}] ${d.content.slice(0, 500)}${d.content.length > 500 ? "..." : ""}`).join("\n\n")}`);
    }

    // Flywheel examples (for few-shot learning)
    if (result.flywheelExamples.length > 0) {
      sections.push(`### EXAMPLES (Style Reference)\n${result.flywheelExamples.map(r => 
        `Q: ${r.userMessage.slice(0, 100)}...\nA: ${r.assistantResponse.slice(0, 200)}...`
      ).join("\n\n")}`);
    }

    return sections.join("\n\n");
  }
}

// Factory function
export function createUnifiedContext(
  rag: RAGPipelineV2,
  flywheel: FlywheelLogger,
  router: RetrievalRouter
): UnifiedContext {
  return new UnifiedContext(rag, flywheel, router);
}
