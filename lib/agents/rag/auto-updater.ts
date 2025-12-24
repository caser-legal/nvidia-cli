
import { RAGPipelineV2 } from "./pipeline-v2";
import { FlywheelLogger } from "../flywheel/logger";

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
  async sync(minRating: number = 5): Promise<number> {
    const candidates = this.flywheel.getHighQualityRecords(minRating);
    let ingestedCount = 0;

    for (const record of candidates) {
      // Skip if already ingested (ID-based deduplication)
      const docId = `flywheel-${record.id}`;
      if (this.ingestedIds.has(docId)) {
        continue;
      }
      
      const docContent = `Q: ${record.userMessage}\nA: ${record.assistantResponse}`;
      
      await this.rag.ingest([{
        id: docId,
        content: docContent,
        metadata: {
          source: "flywheel_auto_update",
          originalTimestamp: record.timestamp,
          rating: record.qualitySignals?.userRating,
          workloadId: record.workloadId
        }
      }]);
      
      this.ingestedIds.add(docId);
      ingestedCount++;
    }

    return ingestedCount;
  }
  
  /**
   * Clear ingestion tracking (for testing or reset)
   */
  reset(): void {
    this.ingestedIds.clear();
  }
}
