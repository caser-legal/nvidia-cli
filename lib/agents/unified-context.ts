/**
 * Unified Context Layer
 * Aggregates context from RAG, Memory, and Data Flywheel systems
 * to provide a comprehensive context for agents.
 */

import { RAGPipeline, Document } from "./rag/pipeline";
import { RAGPipelineV2 } from "./rag/pipeline-v2";
import { ShortTermMemory, LongTermMemory, MemoryEntry, ConversationSummary, EntityMemoryTool } from "./tools/memory";
import { FlywheelLogger } from "./flywheel/logger";
import { FlywheelRecord } from "./flywheel/types";
import { RetrievalRouter, RetrievalSource } from "./retrieval-router";

// Support both V1 and V2 pipelines
type RAGPipelineInterface = RAGPipeline | RAGPipelineV2;

export interface UnifiedContextQuery {
  query: string;
  includeRAG?: boolean;
  includeMemory?: boolean;
  includeFlywheel?: boolean;
  limit?: number;
}

export interface UnifiedContextResult {
  ragDocuments: Document[];
  shortTermMemories: MemoryEntry[];
  longTermMemories: MemoryEntry[];
  entities: MemoryEntry[];
  conversationSummary?: ConversationSummary;
  flywheelExamples: FlywheelRecord[];
  formattedContext: string;
}

export class UnifiedContext {
  constructor(
    private rag: RAGPipelineInterface,
    private shortTerm: ShortTermMemory,
    private longTerm: LongTermMemory,
    private flywheel: FlywheelLogger,
    private router: RetrievalRouter,
    private entityMemory?: EntityMemoryTool
  ) {}

  /**
   * Retrieve unified context from all available sources
   */
  async retrieve(params: UnifiedContextQuery): Promise<UnifiedContextResult> {
    let { 
      includeRAG, 
      includeMemory
    } = params;
    const {
      query, 
      includeFlywheel = true,
      limit = 5 
    } = params;

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
      } catch (error) {
        console.error("Retrieval routing failed, defaulting to full search:", error);
        includeRAG = true;
        includeMemory = true;
      }
    }

    // Parallel retrieval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promises: Promise<any>[] = [];

    // 1. RAG Search
    if (includeRAG) {
      promises.push(this.rag.search(query).then(res => res.documents).catch(() => []));
    } else {
      promises.push(Promise.resolve([]));
    }

    // 2. Long-term Memory Search
    if (includeMemory) {
      promises.push(this.longTerm.search(query).catch(() => []));
    } else {
      promises.push(Promise.resolve([]));
    }

    // 3. Entity Search (Structured via EntityMemoryTool if available)
    if (includeMemory && this.entityMemory) {
      // Use EntityMemoryTool to find specific entity matches
      // We search for entities matching the query
      promises.push(this.entityMemory.execute({ operation: "get", entity_name: query }).then(res => {
        if (res.startsWith("Error:") || res.startsWith("No information found")) return [];
        return [{
          id: `entity-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "entity" as const,
          content: res,
          metadata: { query }
        } as MemoryEntry];
      }).catch(() => []));
    } else if (includeMemory) {
      // Fallback to naive search
      promises.push(this.longTerm.search(query).then(
        mems => mems.filter(m => m.type === "entity")
      ).catch(() => []));
    } else {
      promises.push(Promise.resolve([]));
    }

    // Wait for async operations
    const [ragDocs, longTermMems, entityMems] = await Promise.all(promises) as [
      Document[],
      MemoryEntry[],
      MemoryEntry[]
    ];

    // Synchronous Memory Retrieval
    let shortTermMems: MemoryEntry[] = [];
    let summary: ConversationSummary | undefined;

    if (includeMemory) {
      shortTermMems = this.shortTerm.search(query);
      summary = this.shortTerm.getSummary();
    }

    // Flywheel Retrieval (Simple keyword matching for now)
    let flywheelExamples: FlywheelRecord[] = [];
    if (includeFlywheel) {
      const allHighQuality = this.flywheel.getHighQualityRecords(4); // 4+ stars
      const queryLower = query.toLowerCase();
      // Simple relevance: check if query words appear in user message
      // Ideal: semantic search on flywheel records
      flywheelExamples = allHighQuality
        .filter(r => r.userMessage.toLowerCase().includes(queryLower) || queryLower.includes(r.userMessage.toLowerCase()))
        .slice(0, 3); // Top 3 examples
    }

    // Format the result
    const result: UnifiedContextResult = {
      ragDocuments: ragDocs.slice(0, limit),
      shortTermMemories: shortTermMems.slice(0, limit),
      longTermMemories: longTermMems.slice(0, limit),
      entities: entityMems.slice(0, limit),
      conversationSummary: summary,
      flywheelExamples,
      formattedContext: ""
    };

    result.formattedContext = this.formatContext(result);

    return result;
  }

  /**
   * Format the retrieved context into a string for LLM consumption
   * Implements explicit context arbitration strategy.
   */
  private formatContext(result: UnifiedContextResult): string {
    const sections: string[] = [];

    // Arbitration Header
    sections.push(`### CONTEXT ARBITRATION STRATEGY
1. **FACTS (Verified)**: RAG documents. Highest priority for objective truth.
2. **USER CONTEXT (Personal)**: Memories. Highest priority for user preferences/state.
3. **SUGGESTIONS (Historical)**: Flywheel examples. Use for style/format guidance only.
If FACTS and USER CONTEXT conflict on world knowledge, prefer FACTS.
If they conflict on user preference, prefer USER CONTEXT.`);

    // 1. Critical Entities (User Context)
    if (result.entities.length > 0) {
      sections.push(`### USER CONTEXT (Entities)\n${result.entities.map(e => `- ${e.content}`).join("\n")}`);
    }

    // 2. Conversation Summary (User Context)
    if (result.conversationSummary) {
      const s = result.conversationSummary;
      sections.push(`### USER CONTEXT (Session)\nTopics: ${s.topics.join(", ")}\nKey Facts: ${s.keyFacts.join("; ")}`);
    }

    // 3. Relevant Memories (User Context)
    if (result.shortTermMemories.length > 0 || result.longTermMemories.length > 0) {
      const allMems = [...result.shortTermMemories, ...result.longTermMemories]
        // Deduplicate by content
        .filter((v, i, a) => a.findIndex(t => t.content === v.content) === i)
        .slice(0, 10);
      
      sections.push(`### USER CONTEXT (Memories)\n${allMems.map(m => `- [${m.type}] ${m.content}`).join("\n")}`);
    }

    // 4. RAG Knowledge (Facts)
    if (result.ragDocuments.length > 0) {
      sections.push(`### FACTS (Verified Knowledge)\n${result.ragDocuments.map((d, i) => `[Doc ${i+1}] ${d.content}`).join("\n\n")}`);
    }

    // 5. Successful Past Examples (Suggestions)
    if (result.flywheelExamples.length > 0) {
      sections.push(`### SUGGESTIONS (Historical Patterns)\n${result.flywheelExamples.map(r => `User: ${r.userMessage}\nAssistant: ${r.assistantResponse.slice(0, 200)}...`).join("\n\n")}`);
    }

    return sections.join("\n\n");
  }
}
