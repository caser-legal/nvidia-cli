
import { FlywheelLogger } from "./flywheel/logger";
import { FlywheelRecord } from "./flywheel/types";

export interface OptimizationResult {
  improvedSystemPrompt?: string;
  suggestedExamples: string[];
  insights: string[];
}

export class FeedbackOptimizer {
  constructor(private flywheel: FlywheelLogger) {}

  /**
   * Analyze low-scoring interactions to find improvement areas
   */
  async analyzeFailures(minScore: number = 3): Promise<FlywheelRecord[]> {
    const records = this.flywheel.getRecords();
    return records.filter(r => 
      r.qualitySignals?.userRating !== undefined && 
      r.qualitySignals.userRating < minScore
    );
  }

  /**
   * Get "Golden Examples" - high scoring interactions to use as few-shot examples
   */
  async getGoldenExamples(query: string, limit: number = 3): Promise<FlywheelRecord[]> {
    const highQuality = this.flywheel.getHighQualityRecords(4); // 4+ stars
    
    // Simple relevance scoring based on word overlap
    // In production, use embeddings
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    
    const scored = highQuality.map(record => {
      const recordWords = new Set(record.userMessage.toLowerCase().split(/\s+/));
      let intersection = 0;
      for (const word of queryWords) {
        if (recordWords.has(word)) intersection++;
      }
      return { record, score: intersection };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.record);
  }

  /**
   * Generate optimization suggestions (Mock implementation for now)
   */
  async generateOptimizations(): Promise<OptimizationResult> {
    const failures = await this.analyzeFailures();
    
    // In a real system, an LLM would analyze 'failures' to generate these insights
    const insights = failures.length > 0 
      ? [`Found ${failures.length} interactions with low scores.`, "Users often request more code examples."]
      : ["No significant failures detected."];

    return {
      suggestedExamples: [],
      insights
    };
  }
}
