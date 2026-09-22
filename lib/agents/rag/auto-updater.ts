/**
 * Auto RAG Updater
 * Automatically ingests high-quality flywheel records into RAG
 */

import { RAGPipelineV2 } from "./pipeline-v2";
import { FlywheelLogger } from "../flywheel/logger";
import { FlywheelRecord, QUALITY_THRESHOLD } from "../flywheel/types";
import { createLogger } from "../../logger";

const log = createLogger("AutoRAGUpdater");

export class AutoRAGUpdater {
  private ingestedIds: Set<string> = new Set();

  constructor(
    private rag: RAGPipelineV2,
    private flywheel: FlywheelLogger
  ) {}

  /**
   * Auto-ingest high-quality resolved interactions into RAG
   * Deduplicates by record ID to prevent duplicate entries
   */
  async sync(minScore: number = QUALITY_THRESHOLD): Promise<number> {
    const records = this.flywheel.getRecords();
    
    // Filter to high-quality records
    const candidates = records.filter((r) => {
      // Check LLM-as-Judge score (primary)
      if (r.qualitySignals?.overallScore !== undefined) {
        return r.qualitySignals.overallScore >= minScore;
      }
      // Fall back to user rating (convert 1-5 to 0-10)
      if (r.qualitySignals?.userRating !== undefined) {
        return r.qualitySignals.userRating * 2 >= minScore;
      }
      return false;
    });

    let ingestedCount = 0;

    for (const record of candidates) {
      // Skip if already ingested (ID-based deduplication)
      const docId = `flywheel-${record.id}`;
      if (this.ingestedIds.has(docId)) {
        continue;
      }

      // Format as Q&A document
      const docContent = this.formatRecordAsDocument(record);

      try {
        await this.rag.ingest([
          {
            id: docId,
            content: docContent,
            metadata: {
              source: "flywheel_auto_update",
              originalTimestamp: record.timestamp,
              score: record.qualitySignals?.overallScore,
              userRating: record.qualitySignals?.userRating,
              workloadId: record.workloadId,
              workloadType: record.workloadType,
              model: record.model,
            },
          },
        ]);

        this.ingestedIds.add(docId);
        ingestedCount++;
      } catch (error) {
        log.error("Failed to ingest record to RAG", {
          recordId: record.id,
          error: String(error),
        });
      }
    }

    if (ingestedCount > 0) {
      log.info(`Auto-ingested ${ingestedCount} high-quality records to RAG`, {
        totalCandidates: candidates.length,
        minScore,
      });
    }

    return ingestedCount;
  }

  /**
   * Format a flywheel record as a RAG document
   */
  private formatRecordAsDocument(record: FlywheelRecord): string {
    const parts: string[] = [];

    // Question
    parts.push(`## Question\n${record.userMessage}`);

    // Answer
    parts.push(`## Answer\n${record.assistantResponse}`);

    // Tool usage summary (if any)
    if (record.toolCalls.length > 0) {
      const successfulTools = record.toolCalls.filter((t) => t.success);
      const toolSummary = successfulTools
        .map((t) => `- ${t.toolName}`)
        .join("\n");
      if (toolSummary) {
        parts.push(`## Tools Used\n${toolSummary}`);
      }
    }

    // Quality metadata
    const score = record.qualitySignals?.overallScore;
    if (score !== undefined) {
      parts.push(`## Quality Score: ${score}/10`);
    }

    return parts.join("\n\n");
  }

  /**
   * Get count of ingested records
   */
  getIngestedCount(): number {
    return this.ingestedIds.size;
  }

  /**
   * Clear ingestion tracking (for testing or reset)
   */
  reset(): void {
    this.ingestedIds.clear();
    log.info("AutoRAGUpdater reset");
  }

  /**
   * Force re-sync all high-quality records
   */
  async forceResync(minScore: number = QUALITY_THRESHOLD): Promise<number> {
    this.reset();
    return this.sync(minScore);
  }
}
