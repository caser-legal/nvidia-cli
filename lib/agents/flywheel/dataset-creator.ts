/**
 * Data Flywheel Dataset Creator
 * Creates training datasets from logged interactions
 */

import { FlywheelRecord, FlywheelDataset, QUALITY_THRESHOLD, MIN_RESPONSE_LENGTH, MAX_ERROR_RATE } from "./types";
import { FlywheelLogger } from "./logger";
import { createLogger } from "../../logger";

const log = createLogger("DatasetCreator");

export interface DataSplitConfig {
  trainRatio: number;
  evalRatio: number;
  testRatio: number;
  minRecords: number;
  maxRecords?: number;
}

const DEFAULT_SPLIT_CONFIG: DataSplitConfig = {
  trainRatio: 0.8,
  evalRatio: 0.1,
  testRatio: 0.1,
  minRecords: 10,
};

/**
 * Fisher-Yates shuffle
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class DatasetCreator {
  private logger: FlywheelLogger;
  private config: DataSplitConfig;

  constructor(logger: FlywheelLogger, config?: Partial<DataSplitConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_SPLIT_CONFIG, ...config };
  }

  /**
   * Validate records meet quality bar for training
   */
  private validateRecords(records: FlywheelRecord[]): FlywheelRecord[] {
    return records.filter((r) => {
      // Must have content
      if (!r.userMessage || !r.assistantResponse) return false;

      // Response must be substantial
      if (r.assistantResponse.length < MIN_RESPONSE_LENGTH) return false;

      // Check quality score if available
      if (r.qualitySignals?.overallScore !== undefined) {
        if (r.qualitySignals.overallScore < QUALITY_THRESHOLD) return false;
      }

      // Check user rating if available (convert 1-5 to 0-10)
      if (r.qualitySignals?.userRating !== undefined && r.qualitySignals?.overallScore === undefined) {
        if (r.qualitySignals.userRating * 2 < QUALITY_THRESHOLD) return false;
      }

      // Check error rate
      if (r.qualitySignals?.errorCount && r.qualitySignals?.toolCallCount) {
        const errorRate = r.qualitySignals.errorCount / r.qualitySignals.toolCallCount;
        if (errorRate > MAX_ERROR_RATE) return false;
      }

      return true;
    });
  }

  /**
   * Convert record to OpenAI fine-tuning format
   */
  private toOpenAIFormat(record: FlywheelRecord): object {
    return {
      messages: [
        { role: "system", content: record.systemPrompt },
        ...record.conversationHistory,
        { role: "user", content: record.userMessage },
        { role: "assistant", content: record.assistantResponse },
      ],
    };
  }

  /**
   * Convert record to format with tool calls
   */
  private toToolCallingFormat(record: FlywheelRecord): object {
    const toolCalls = record.toolCalls.map((tc) => ({
      type: "function",
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.arguments),
      },
    }));

    return {
      messages: [
        { role: "system", content: record.systemPrompt },
        ...record.conversationHistory,
        { role: "user", content: record.userMessage },
        {
          role: "assistant",
          content: record.assistantResponse,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      ],
    };
  }

  /**
   * Create train/eval/test datasets from logged records
   */
  createDatasets(workloadId: string): {
    train: FlywheelDataset;
    eval: FlywheelDataset;
    test: FlywheelDataset;
  } | null {
    const allRecords = this.logger.getRecords();
    const validRecords = this.validateRecords(allRecords);

    log.info(`Validating records`, {
      total: allRecords.length,
      valid: validRecords.length,
      minRequired: this.config.minRecords,
    });

    if (validRecords.length < this.config.minRecords) {
      log.warn(`Not enough valid records for dataset creation`, {
        valid: validRecords.length,
        required: this.config.minRecords,
      });
      return null;
    }

    // Apply max records limit if set
    let records = validRecords;
    if (this.config.maxRecords && records.length > this.config.maxRecords) {
      records = shuffle(records).slice(0, this.config.maxRecords);
    }

    // Shuffle and split
    const shuffled = shuffle(records);
    const trainEnd = Math.floor(shuffled.length * this.config.trainRatio);
    const evalEnd = trainEnd + Math.floor(shuffled.length * this.config.evalRatio);

    const trainRecords = shuffled.slice(0, trainEnd);
    const evalRecords = shuffled.slice(trainEnd, evalEnd);
    const testRecords = shuffled.slice(evalEnd);

    const now = new Date().toISOString();

    const datasets = {
      train: {
        name: `${workloadId}-train`,
        type: "train" as const,
        records: trainRecords,
        numRecords: trainRecords.length,
        createdAt: now,
        workloadId,
      },
      eval: {
        name: `${workloadId}-eval`,
        type: "base" as const,
        records: evalRecords,
        numRecords: evalRecords.length,
        createdAt: now,
        workloadId,
      },
      test: {
        name: `${workloadId}-test`,
        type: "icl" as const,
        records: testRecords,
        numRecords: testRecords.length,
        createdAt: now,
        workloadId,
      },
    };

    log.info(`Created datasets`, {
      train: trainRecords.length,
      eval: evalRecords.length,
      test: testRecords.length,
    });

    return datasets;
  }

  /**
   * Export dataset to JSONL format
   */
  exportToJSONL(dataset: FlywheelDataset, includeToolCalls: boolean = false): string {
    return dataset.records
      .map((r) => JSON.stringify(includeToolCalls ? this.toToolCallingFormat(r) : this.toOpenAIFormat(r)))
      .join("\n");
  }

  /**
   * Get statistics for a dataset
   */
  getDatasetStats(dataset: FlywheelDataset): {
    numRecords: number;
    avgResponseLength: number;
    avgToolCalls: number;
    workloadTypes: Record<string, number>;
    models: Record<string, number>;
    avgScore: number;
  } {
    const records = dataset.records;
    if (records.length === 0) {
      return {
        numRecords: 0,
        avgResponseLength: 0,
        avgToolCalls: 0,
        workloadTypes: {},
        models: {},
        avgScore: 0,
      };
    }

    let totalResponseLength = 0;
    let totalToolCalls = 0;
    let totalScore = 0;
    let scoredCount = 0;
    const workloadTypes: Record<string, number> = {};
    const models: Record<string, number> = {};

    for (const r of records) {
      totalResponseLength += r.assistantResponse.length;
      totalToolCalls += r.toolCalls.length;

      const type = r.workloadType || "unknown";
      workloadTypes[type] = (workloadTypes[type] || 0) + 1;

      const model = r.model || "unknown";
      models[model] = (models[model] || 0) + 1;

      if (r.qualitySignals?.overallScore !== undefined) {
        totalScore += r.qualitySignals.overallScore;
        scoredCount++;
      }
    }

    return {
      numRecords: records.length,
      avgResponseLength: Math.round(totalResponseLength / records.length),
      avgToolCalls: Math.round((totalToolCalls / records.length) * 10) / 10,
      workloadTypes,
      models,
      avgScore: scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0,
    };
  }
}
