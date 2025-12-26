/**
 * Data Flywheel Logger
 * Captures agent interactions for continuous model improvement
 * Based on NVIDIA Data Flywheel Blueprint
 */

import {
  FlywheelRecord,
  ToolCallRecord,
  QualitySignals,
  WorkloadClassification,
  QUALITY_THRESHOLD,
} from "./types";
import { ingestToElasticsearch } from "./elasticsearch-sink";
import { routeToTrainingDir } from "./quality-filter";
import { createLogger } from "../../logger";

const log = createLogger("Flywheel");

// In-memory store for current session
const recordStore: Map<string, FlywheelRecord[]> = new Map();

/**
 * Generate unique ID for records
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Identify workload type from tool calls
 */
function identifyWorkloadType(toolCalls: ToolCallRecord[]): WorkloadClassification {
  const toolNames = toolCalls.map((t) => t.toolName);

  if (toolNames.some((n) => n.includes("search") || n.includes("research") || n === "search_specialist")) {
    return WorkloadClassification.RESEARCH;
  }
  if (toolNames.some((n) => n === "file_write" || n === "bash" || n.includes("code"))) {
    return WorkloadClassification.CODING;
  }
  if (toolCalls.length > 0) {
    return WorkloadClassification.TOOL_CALLING;
  }
  return WorkloadClassification.GENERIC;
}

/**
 * Calculate initial quality signals from response and tool calls
 */
function calculateQualitySignals(response: string, toolCalls: ToolCallRecord[]): QualitySignals {
  return {
    responseLength: response.length,
    toolCallCount: toolCalls.length,
    errorCount: toolCalls.filter((t) => !t.success).length,
  };
}

export interface LogInteractionParams {
  userMessage: string;
  assistantResponse: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  toolCalls: ToolCallRecord[];
  model: string;
  mode: string;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
}

export class FlywheelLogger {
  private clientId: string;
  private workloadId: string;
  private enabled: boolean;

  constructor(options: { clientId?: string; workloadId?: string; enabled?: boolean } = {}) {
    this.clientId = options.clientId || "nvidia-cli";
    this.workloadId = options.workloadId || `workload-${Date.now()}`;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Log an interaction to the flywheel
   * - Stores in memory
   * - Persists to Elasticsearch
   * - Routes to SFT/DPO directories based on quality
   */
  async logInteraction(params: LogInteractionParams): Promise<FlywheelRecord | null> {
    if (!this.enabled) return null;

    const record: FlywheelRecord = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      clientId: this.clientId,
      workloadId: this.workloadId,
      userMessage: params.userMessage,
      assistantResponse: params.assistantResponse,
      systemPrompt: params.systemPrompt,
      conversationHistory: params.conversationHistory,
      toolCalls: params.toolCalls,
      model: params.model,
      mode: params.mode,
      tokenUsage: params.tokenUsage,
      latencyMs: params.latencyMs,
      qualitySignals: calculateQualitySignals(params.assistantResponse, params.toolCalls),
      workloadType: identifyWorkloadType(params.toolCalls),
    };

    // Store in memory
    const key = `${this.clientId}:${this.workloadId}`;
    if (!recordStore.has(key)) recordStore.set(key, []);
    recordStore.get(key)!.push(record);

    // Persist to Elasticsearch (async, don't block)
    ingestToElasticsearch(record).catch((err) => {
      log.error("Failed to persist to Elasticsearch", { error: err.message, recordId: record.id });
    });

    log.info(`Logged interaction ${record.id}`, {
      workloadType: record.workloadType,
      toolCalls: record.toolCalls.length,
      latencyMs: record.latencyMs,
    });

    return record;
  }

  /**
   * Add LLM-as-Judge evaluation scores to a record
   */
  async addEvaluationScores(recordId: string, scores: Partial<QualitySignals>): Promise<boolean> {
    const key = `${this.clientId}:${this.workloadId}`;
    const records = recordStore.get(key);
    if (!records) return false;

    const record = records.find((r) => r.id === recordId);
    if (!record) return false;

    record.qualitySignals = {
      ...record.qualitySignals!,
      ...scores,
      evaluatedAt: new Date().toISOString(),
    };

    // Route to training directory based on quality
    try {
      await routeToTrainingDir(record);
    } catch (err) {
      log.error("Failed to route to training dir", { error: String(err), recordId });
    }

    // Update in Elasticsearch
    ingestToElasticsearch(record).catch((err) => {
      log.error("Failed to update in Elasticsearch", { error: err.message, recordId });
    });

    log.info(`Added evaluation scores to ${recordId}`, { overallScore: scores.overallScore });
    return true;
  }

  /**
   * Add user feedback to a record
   */
  addUserFeedback(recordId: string, rating: number, feedback?: string): boolean {
    const key = `${this.clientId}:${this.workloadId}`;
    const records = recordStore.get(key);
    if (!records) return false;

    const record = records.find((r) => r.id === recordId);
    if (!record) return false;

    record.qualitySignals = {
      ...record.qualitySignals!,
      userRating: rating,
      userFeedback: feedback,
    };

    // Route to training directory if we have enough signal
    if (record.qualitySignals.overallScore !== undefined || rating >= 4) {
      routeToTrainingDir(record).catch((err) => {
        log.error("Failed to route to training dir", { error: String(err), recordId });
      });
    }

    log.info(`Added user feedback to ${recordId}`, { rating });
    return true;
  }

  /**
   * Get all records for current workload
   */
  getRecords(): FlywheelRecord[] {
    const key = `${this.clientId}:${this.workloadId}`;
    return recordStore.get(key) || [];
  }

  /**
   * Get high-quality records suitable for training
   */
  getHighQualityRecords(minScore: number = QUALITY_THRESHOLD): FlywheelRecord[] {
    return this.getRecords().filter((r) => {
      // Check LLM-as-Judge score
      if (r.qualitySignals?.overallScore !== undefined) {
        return r.qualitySignals.overallScore >= minScore;
      }
      // Fall back to user rating (convert 1-5 to 0-10 scale)
      if (r.qualitySignals?.userRating !== undefined) {
        return r.qualitySignals.userRating * 2 >= minScore;
      }
      return false;
    });
  }

  /**
   * Get records that need evaluation
   */
  getUnevaluatedRecords(): FlywheelRecord[] {
    return this.getRecords().filter(
      (r) => r.qualitySignals?.overallScore === undefined && r.qualitySignals?.userRating === undefined
    );
  }

  /**
   * Export records in OpenAI fine-tuning format
   */
  exportForTraining(): string[] {
    return this.getRecords().map((r) => {
      const messages = [
        { role: "system", content: r.systemPrompt },
        ...r.conversationHistory,
        { role: "user", content: r.userMessage },
        { role: "assistant", content: r.assistantResponse },
      ];
      return JSON.stringify({ messages });
    });
  }

  /**
   * Export records with tool calls in OpenAI format
   */
  exportWithToolCalls(): string[] {
    return this.getRecords()
      .filter((r) => r.toolCalls.length > 0)
      .map((r) => {
        const toolCallsFormatted = r.toolCalls.map((tc) => ({
          type: "function",
          function: { name: tc.toolName, arguments: JSON.stringify(tc.arguments) },
        }));
        return JSON.stringify({
          messages: [
            { role: "system", content: r.systemPrompt },
            ...r.conversationHistory,
            { role: "user", content: r.userMessage },
            {
              role: "assistant",
              content: r.assistantResponse,
              tool_calls: toolCallsFormatted.length > 0 ? toolCallsFormatted : undefined,
            },
          ],
        });
      });
  }

  /**
   * Get statistics for current workload
   */
  getStats() {
    const records = this.getRecords();
    if (records.length === 0) {
      return {
        totalRecords: 0,
        evaluatedRecords: 0,
        highQualityRecords: 0,
        byWorkloadType: {},
        avgLatencyMs: 0,
        avgToolCalls: 0,
        errorRate: 0,
        avgScore: 0,
      };
    }

    const byWorkloadType: Record<string, number> = {};
    let totalLatency = 0;
    let totalToolCalls = 0;
    let totalErrors = 0;
    let totalScore = 0;
    let scoredCount = 0;

    for (const r of records) {
      const type = r.workloadType || WorkloadClassification.GENERIC;
      byWorkloadType[type] = (byWorkloadType[type] || 0) + 1;
      totalLatency += r.latencyMs;
      totalToolCalls += r.toolCalls.length;
      totalErrors += r.toolCalls.filter((t) => !t.success).length;
      if (r.qualitySignals?.overallScore !== undefined) {
        totalScore += r.qualitySignals.overallScore;
        scoredCount++;
      }
    }

    return {
      totalRecords: records.length,
      evaluatedRecords: scoredCount,
      highQualityRecords: this.getHighQualityRecords().length,
      byWorkloadType,
      avgLatencyMs: Math.round(totalLatency / records.length),
      avgToolCalls: Math.round((totalToolCalls / records.length) * 10) / 10,
      errorRate: totalToolCalls > 0 ? Math.round((totalErrors / totalToolCalls) * 100) / 100 : 0,
      avgScore: scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0,
    };
  }

  /**
   * Clear records for current workload
   */
  clear(): void {
    const key = `${this.clientId}:${this.workloadId}`;
    recordStore.delete(key);
    log.info("Cleared flywheel records", { key });
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

let globalLogger: FlywheelLogger | null = null;

export function getFlywheelLogger(
  options?: { clientId?: string; workloadId?: string; enabled?: boolean }
): FlywheelLogger {
  if (!globalLogger) {
    globalLogger = new FlywheelLogger(options);
  }
  return globalLogger;
}

export function resetFlywheelLogger(): void {
  globalLogger = null;
}

// Re-export types and constants
export type { FlywheelRecord, ToolCallRecord, QualitySignals } from "./types";
export { QUALITY_THRESHOLD } from "./types";
