// Data Flywheel Dataset Creator
// Creates training datasets from logged interactions
// Based on NVIDIA Data Flywheel Blueprint

import { 
  FlywheelRecord, 
  FlywheelDataset
} from "./types";
import { FlywheelLogger, QUALITY_THRESHOLD } from "./logger";

export interface DataSplitConfig {
  trainRatio: number;  // e.g., 0.8
  evalRatio: number;   // e.g., 0.1
  testRatio: number;   // e.g., 0.1
  minRecords: number;  // Minimum records needed
  maxRecords?: number; // Optional cap
}

const DEFAULT_SPLIT_CONFIG: DataSplitConfig = {
  trainRatio: 0.8,
  evalRatio: 0.1,
  testRatio: 0.1,
  minRecords: 10,
};

// Shuffle array in place
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
  
  // Validate records meet quality thresholds
  private validateRecords(records: FlywheelRecord[]): FlywheelRecord[] {
    return records.filter(r => {
      // Must have both input and output
      if (!r.userMessage || !r.assistantResponse) return false;
      
      // Response should be meaningful (not just errors)
      if (r.assistantResponse.length < 50) return false;
      
      // Must meet LLM-as-judge quality threshold (>= 7 on 0-10 scale)
      if (r.qualitySignals?.overallScore !== undefined) {
        if (r.qualitySignals.overallScore < QUALITY_THRESHOLD) return false;
      }
      
      // If has user rating but no LLM score, must be >= 3
      if (r.qualitySignals?.userRating && !r.qualitySignals?.overallScore) {
        if (r.qualitySignals.userRating < 3) return false;
      }
      
      // Error rate should be low
      if (r.qualitySignals?.errorCount && r.qualitySignals.toolCallCount) {
        const errorRate = r.qualitySignals.errorCount / r.qualitySignals.toolCallCount;
        if (errorRate > 0.5) return false;
      }
      
      return true;
    });
  }
  
  // Convert record to OpenAI chat format
  private toOpenAIFormat(record: FlywheelRecord): object {
    const messages = [
      { role: "system", content: record.systemPrompt },
      ...record.conversationHistory,
      { role: "user", content: record.userMessage },
      { role: "assistant", content: record.assistantResponse },
    ];
    return { messages };
  }
  
  // Convert record to tool-calling format
  private toToolCallingFormat(record: FlywheelRecord): object {
    const tools = record.toolCalls.map(tc => ({
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
          tool_calls: tools.length > 0 ? tools : undefined,
        },
      ],
    };
  }
  
  // Create datasets from logged records
  createDatasets(workloadId: string): {
    train: FlywheelDataset;
    eval: FlywheelDataset;
    test: FlywheelDataset;
  } | null {
    const allRecords = this.logger.getRecords();
    const validRecords = this.validateRecords(allRecords);
    
    if (validRecords.length < this.config.minRecords) {
      console.log(`[Flywheel] Not enough records: ${validRecords.length} < ${this.config.minRecords}`);
      return null;
    }
    
    // Apply max cap if set
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
    
    return {
      train: {
        name: `${workloadId}-train`,
        type: "train",
        records: trainRecords,
        numRecords: trainRecords.length,
        createdAt: now,
        workloadId,
      },
      eval: {
        name: `${workloadId}-eval`,
        type: "base",
        records: evalRecords,
        numRecords: evalRecords.length,
        createdAt: now,
        workloadId,
      },
      test: {
        name: `${workloadId}-test`,
        type: "icl",
        records: testRecords,
        numRecords: testRecords.length,
        createdAt: now,
        workloadId,
      },
    };
  }
  
  // Export dataset to JSONL format (for fine-tuning)
  exportToJSONL(dataset: FlywheelDataset, includeToolCalls: boolean = false): string {
    const lines = dataset.records.map(r => {
      const formatted = includeToolCalls 
        ? this.toToolCallingFormat(r)
        : this.toOpenAIFormat(r);
      return JSON.stringify(formatted);
    });
    return lines.join("\n");
  }
  
  // Get dataset statistics
  getDatasetStats(dataset: FlywheelDataset): {
    numRecords: number;
    avgResponseLength: number;
    avgToolCalls: number;
    workloadTypes: Record<string, number>;
    models: Record<string, number>;
  } {
    const records = dataset.records;
    if (records.length === 0) {
      return {
        numRecords: 0,
        avgResponseLength: 0,
        avgToolCalls: 0,
        workloadTypes: {},
        models: {},
      };
    }
    
    let totalResponseLength = 0;
    let totalToolCalls = 0;
    const workloadTypes: Record<string, number> = {};
    const models: Record<string, number> = {};
    
    for (const r of records) {
      totalResponseLength += r.assistantResponse.length;
      totalToolCalls += r.toolCalls.length;
      
      const mode = r.mode || "unknown";
      workloadTypes[mode] = (workloadTypes[mode] || 0) + 1;
      
      const model = r.model || "unknown";
      models[model] = (models[model] || 0) + 1;
    }
    
    return {
      numRecords: records.length,
      avgResponseLength: totalResponseLength / records.length,
      avgToolCalls: totalToolCalls / records.length,
      workloadTypes,
      models,
    };
  }
}
