
import { RAGPipeline } from "./pipeline";
import { FlywheelLogger } from "../flywheel/logger";

export class AutoRAGUpdater {
  constructor(
    private rag: RAGPipeline,
    private flywheel: FlywheelLogger
  ) {}

  /**
   * Auto-ingest high-quality resolved interactions into RAG
   */
  async sync(minRating: number = 5): Promise<number> {
    const candidates = this.flywheel.getHighQualityRecords(minRating);
    let ingestedCount = 0;

    for (const record of candidates) {
      // Check if already ingested (using ID)
      // Note: SimpleVectorStore doesn't expose an 'exists' check efficiently, 
      // so we might duplicate or rely on RAGPipeline dedupe logic.
      
      const docContent = `Q: ${record.userMessage}\nA: ${record.assistantResponse}`;
      
      await this.rag.ingest([{
        id: `flywheel-${record.id}`,
        content: docContent,
        metadata: {
          source: "flywheel_auto_update",
          originalTimestamp: record.timestamp,
          rating: record.qualitySignals?.userRating,
          workloadId: record.workloadId
        }
      }]);
      
      ingestedCount++;
    }

    return ingestedCount;
  }
}
