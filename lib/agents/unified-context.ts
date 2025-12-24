/**
 * Unified Context Layer
 * Aggregates context from RAG, Memory, and Data Flywheel systems
 * to provide a comprehensive context for agents.
 */

import { RAGPipelineV2 } from "./rag/pipeline-v2";
import { Document } from "./rag/types";
import { VectorMemoryStore, MemoryEntry, getVectorMemory } from "./memory";
import { FlywheelLogger } from "./flywheel/logger";
import { FlywheelRecord } from "./flywheel/types";
import { RetrievalRouter, RetrievalSource } from "./retrieval-router";

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
    private memory: VectorMemoryStore,
    private flywheel: FlywheelLogger,
    private router: RetrievalRouter,
  ) {}

  /**
   * Retrieve unified context from all available sources
   */
  async retrieve(params: UnifiedContextQuery): Promise<UnifiedContextResult> {
    let { includeRAG, includeMemory } = params;
    const { query, includeFlywheel = true, limit = 5 } = params;

    // Intelligent Routing if flags are not explicit
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
        includeRAG = true;
        includeMemory = true;
      }
    }

    // Parallel retrieval
    const [ragDocs, memories] = await Promise.all([
      includeRAG ? this.rag.search(query).then(res => res.documents).catch(() => []) : [],
      includeMemory ? this.memory.search(query, limit).catch(() => []) : [],
    ]);

    // Filter entities from memories
    const entities = memories.filter(m => m.type === "entity");
    const nonEntityMemories = memories.filter(m => m.type !== "entity");

    // Flywheel: semantic search would be ideal, but keyword match for now
    let flywheelExamples: FlywheelRecord[] = [];
    if (includeFlywheel) {
      const allHighQuality = this.flywheel.getHighQualityRecords(4);
      const queryLower = query.toLowerCase();
      flywheelExamples = allHighQuality
        .filter(r => r.userMessage.toLowerCase().includes(queryLower))
        .slice(0, 3);
    }

    const result: UnifiedContextResult = {
      ragDocuments: ragDocs.slice(0, limit),
      memories: nonEntityMemories.slice(0, limit),
      entities: entities.slice(0, limit),
      flywheelExamples,
      formattedContext: ""
    };

    result.formattedContext = this.formatContext(result);
    return result;
  }

  private formatContext(result: UnifiedContextResult): string {
    const sections: string[] = [];

    sections.push(`### CONTEXT ARBITRATION
1. **FACTS**: RAG documents - highest priority for objective truth
2. **USER CONTEXT**: Memories - highest priority for user preferences
3. **SUGGESTIONS**: Flywheel examples - style/format guidance only`);

    if (result.entities.length > 0) {
      sections.push(`### ENTITIES\n${result.entities.map(e => `- ${e.content}`).join("\n")}`);
    }

    if (result.memories.length > 0) {
      sections.push(`### MEMORIES\n${result.memories.map(m => `- [${m.type}] ${m.content}`).join("\n")}`);
    }

    if (result.ragDocuments.length > 0) {
      sections.push(`### FACTS\n${result.ragDocuments.map((d, i) => `[${i+1}] ${d.content}`).join("\n\n")}`);
    }

    if (result.flywheelExamples.length > 0) {
      sections.push(`### EXAMPLES\n${result.flywheelExamples.map(r => `Q: ${r.userMessage}\nA: ${r.assistantResponse.slice(0, 200)}...`).join("\n\n")}`);
    }

    return sections.join("\n\n");
  }
}

// Factory function for easy instantiation
export function createUnifiedContext(
  rag: RAGPipelineV2,
  flywheel: FlywheelLogger,
  router: RetrievalRouter
): UnifiedContext {
  return new UnifiedContext(rag, getVectorMemory(), flywheel, router);
}
