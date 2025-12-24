// Data Flywheel Dataset Creator
// Creates training datasets from logged interactions

import { FlywheelRecord, FlywheelDataset } from "./types";
import { FlywheelLogger, QUALITY_THRESHOLD } from "./logger";
import { createLogger } from "../../logger";

const log = createLogger("Flywheel");

export interface DataSplitConfig {
  trainRatio: number;
  evalRatio: number;
  testRatio: number;
  minRecords: number;
  maxRecords?: number;
}

const DEFAULT_SPLIT_CONFIG: DataSplitConfig = { trainRatio: 0.8, evalRatio: 0.1, testRatio: 0.1, minRecords: 10 };

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
  
  private validateRecords(records: FlywheelRecord[]): FlywheelRecord[] {
    return records.filter(r => {
      if (!r.userMessage || !r.assistantResponse) return false;
      if (r.assistantResponse.length < 50) return false;
      if (r.qualitySignals?.overallScore !== undefined && r.qualitySignals.overallScore < QUALITY_THRESHOLD) return false;
      if (r.qualitySignals?.userRating && !r.qualitySignals?.overallScore && r.qualitySignals.userRating < 3) return false;
      if (r.qualitySignals?.errorCount && r.qualitySignals.toolCallCount) {
        const errorRate = r.qualitySignals.errorCount / r.qualitySignals.toolCallCount;
        if (errorRate > 0.5) return false;
      }
      return true;
    });
  }
  
  private toOpenAIFormat(record: FlywheelRecord): object {
    return { messages: [{ role: "system", content: record.systemPrompt }, ...record.conversationHistory, { role: "user", content: record.userMessage }, { role: "assistant", content: record.assistantResponse }] };
  }
  
  private toToolCallingFormat(record: FlywheelRecord): object {
    const tools = record.toolCalls.map(tc => ({ type: "function", function: { name: tc.toolName, arguments: JSON.stringify(tc.arguments) } }));
    return {
      messages: [{ role: "system", content: record.systemPrompt }, ...record.conversationHistory, { role: "user", content: record.userMessage }, { role: "assistant", content: record.assistantResponse, tool_calls: tools.length > 0 ? tools : undefined }],
    };
  }
  
  createDatasets(workloadId: string): { train: FlywheelDataset; eval: FlywheelDataset; test: FlywheelDataset } | null {
    const allRecords = this.logger.getRecords();
    const validRecords = this.validateRecords(allRecords);
    
    if (validRecords.length < this.config.minRecords) {
      log.info(`Not enough records: ${validRecords.length} < ${this.config.minRecords}`);
      return null;
    }
    
    let records = validRecords;
    if (this.config.maxRecords && records.length > this.config.maxRecords) {
      records = shuffle(records).slice(0, this.config.maxRecords);
    }
    
    const shuffled = shuffle(records);
    const trainEnd = Math.floor(shuffled.length * this.config.trainRatio);
    const evalEnd = trainEnd + Math.floor(shuffled.length * this.config.evalRatio);
    
    const trainRecords = shuffled.slice(0, trainEnd);
    const evalRecords = shuffled.slice(trainEnd, evalEnd);
    const testRecords = shuffled.slice(evalEnd);
    
    const now = new Date().toISOString();
    
    return {
      train: { name: `${workloadId}-train`, type: "train", records: trainRecords, numRecords: trainRecords.length, createdAt: now, workloadId },
      eval: { name: `${workloadId}-eval`, type: "base", records: evalRecords, numRecords: evalRecords.length, createdAt: now, workloadId },
      test: { name: `${workloadId}-test`, type: "icl", records: testRecords, numRecords: testRecords.length, createdAt: now, workloadId },
    };
  }
  
  exportToJSONL(dataset: FlywheelDataset, includeToolCalls: boolean = false): string {
    return dataset.records.map(r => JSON.stringify(includeToolCalls ? this.toToolCallingFormat(r) : this.toOpenAIFormat(r))).join("\n");
  }
  
  getDatasetStats(dataset: FlywheelDataset): { numRecords: number; avgResponseLength: number; avgToolCalls: number; workloadTypes: Record<string, number>; models: Record<string, number> } {
    const records = dataset.records;
    if (records.length === 0) return { numRecords: 0, avgResponseLength: 0, avgToolCalls: 0, workloadTypes: {}, models: {} };
    
    let totalResponseLength = 0, totalToolCalls = 0;
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
    
    return { numRecords: records.length, avgResponseLength: totalResponseLength / records.length, avgToolCalls: totalToolCalls / records.length, workloadTypes, models };
  }
}
