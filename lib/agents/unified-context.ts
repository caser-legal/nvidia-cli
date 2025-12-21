/**
 * Unified Context Layer
 * Aggregates context from RAG, Memory, and Data Flywheel systems
 * to provide a comprehensive context for agents.
 */

import { RAGPipeline, Document } from "./rag/pipeline";
import { ShortTermMemory, LongTermMemory, MemoryEntry, ConversationSummary } from "./tools/memory";
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
  shortTermMemories: MemoryEntry[];
  longTermMemories: MemoryEntry[];
  entities: MemoryEntry[];
  conversationSummary?: ConversationSummary;
  flywheelExamples: FlywheelRecord[];
  formattedContext: string;
}

export class UnifiedContext {
  constructor(
    private rag: RAGPipeline,
    private shortTerm: ShortTermMemory,
    private longTerm: LongTermMemory,
    private flywheel: FlywheelLogger,
    private router: RetrievalRouter
  ) {}

  /**
   * Retrieve unified context from all available sources
   */
  async retrieve(params: UnifiedContextQuery): Promise<UnifiedContextResult> {
    let { 
      query, 
      includeRAG, 
      includeMemory, 
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

    // 3. Entity Search (approximate via LongTermMemory)
    if (includeMemory) {
      // Find entities mentioned in the query
      // This is a naive implementation; ideal would be NER -> longTerm.get("entity", name)
      promises.push(this.longTerm.search(query).then(
        mems => mems.filter(m => m.type === "entity")
      ).catch(() => []));
    } else {
      promises.push(Promise.resolve([]));
    }

    // Wait for async operations
    const [ragDocs, longTermMems, entityMems] = await Promise.all(promises);

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
   */
  private formatContext(result: UnifiedContextResult): string {
    const sections: string[] = [];

    // 1. Critical Entities
    if (result.entities.length > 0) {
      sections.push(`## Known Entities\n${result.entities.map(e => `- ${e.content}`).join("\n")}`);
    }

    // 2. Conversation Summary
    if (result.conversationSummary) {
      const s = result.conversationSummary;
      sections.push(`## Conversation Context\nTopics: ${s.topics.join(", ")}\nKey Facts: ${s.keyFacts.join("; ")}`);
    }

    // 3. Relevant Memories
    if (result.shortTermMemories.length > 0 || result.longTermMemories.length > 0) {
      const allMems = [...result.shortTermMemories, ...result.longTermMemories]
        // Deduplicate by content
        .filter((v, i, a) => a.findIndex(t => t.content === v.content) === i)
        .slice(0, 10);
      
      sections.push(`## Relevant Memories\n${allMems.map(m => `- [${m.type}] ${m.content}`).join("\n")}`);
    }

    // 4. RAG Knowledge
    if (result.ragDocuments.length > 0) {
      sections.push(`## Retrieved Knowledge\n${result.ragDocuments.map((d, i) => `[Doc ${i+1}] ${d.content}`).join("\n\n")}`);
    }

    // 5. Successful Past Examples (Few-Shot)
    if (result.flywheelExamples.length > 0) {
      sections.push(`## Similar Past Successes\n${result.flywheelExamples.map(r => `User: ${r.userMessage}\nAssistant: ${r.assistantResponse.slice(0, 200)}...`).join("\n\n")}`);
    }

    return sections.join("\n\n");
  }
}
