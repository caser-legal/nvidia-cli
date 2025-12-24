// Data Flywheel Logger
// Captures agent interactions for continuous model improvement

import { FlywheelRecord, ToolCallRecord, QualitySignals, WorkloadClassification } from "./types";
import { createLogger } from "../../logger";

const log = createLogger("Flywheel");

const recordStore: Map<string, FlywheelRecord[]> = new Map();
const MAX_RECORDS_PER_WORKLOAD = 500;

export const QUALITY_THRESHOLD = 7;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function identifyWorkloadType(toolCalls: ToolCallRecord[]): WorkloadClassification {
  const toolNames = toolCalls.map(t => t.toolName);
  if (toolNames.some(n => n.includes("search") || n.includes("research") || n === "search_specialist")) return WorkloadClassification.RESEARCH;
  if (toolNames.some(n => n === "file_write" || n === "bash" || n.includes("code"))) return WorkloadClassification.CODING;
  if (toolCalls.length > 0) return WorkloadClassification.TOOL_CALLING;
  return WorkloadClassification.GENERIC;
}

function calculateQualitySignals(response: string, toolCalls: ToolCallRecord[]): QualitySignals {
  return {
    responseLength: response.length,
    toolCallCount: toolCalls.length,
    errorCount: toolCalls.filter(t => !t.success).length,
  };
}

export class FlywheelLogger {
  private clientId: string;
  private workloadId: string;
  private enabled: boolean;
  
  constructor(options: { clientId?: string; workloadId?: string; enabled?: boolean } = {}) {
    this.clientId = options.clientId || "default";
    this.workloadId = options.workloadId || `workload-${Date.now()}`;
    this.enabled = options.enabled ?? true;
  }
  
  logInteraction(params: {
    userMessage: string;
    assistantResponse: string;
    systemPrompt: string;
    conversationHistory: Array<{ role: string; content: string }>;
    toolCalls: ToolCallRecord[];
    model: string;
    mode: string;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    latencyMs: number;
  }): FlywheelRecord | null {
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
    };
    
    const key = `${this.clientId}:${this.workloadId}`;
    if (!recordStore.has(key)) recordStore.set(key, []);
    const records = recordStore.get(key)!;
    
    while (records.length >= MAX_RECORDS_PER_WORKLOAD) records.shift();
    records.push(record);
    
    log.info(`Logged interaction ${record.id}`, { key, count: records.length, max: MAX_RECORDS_PER_WORKLOAD });
    return record;
  }
  
  addUserFeedback(recordId: string, rating: number, feedback?: string): boolean {
    const key = `${this.clientId}:${this.workloadId}`;
    const records = recordStore.get(key);
    if (!records) return false;
    
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    
    record.qualitySignals = { ...record.qualitySignals!, userRating: rating, userFeedback: feedback };
    log.info(`Added feedback to ${recordId}: ${rating}/5`);
    return true;
  }
  
  getRecords(): FlywheelRecord[] {
    const key = `${this.clientId}:${this.workloadId}`;
    return recordStore.get(key) || [];
  }
  
  getHighQualityRecords(minRating: number = 4): FlywheelRecord[] {
    return this.getRecords().filter(r => {
      if (r.qualitySignals?.overallScore !== undefined) return r.qualitySignals.overallScore >= QUALITY_THRESHOLD;
      if (r.qualitySignals?.userRating !== undefined) return r.qualitySignals.userRating >= minRating;
      return false;
    });
  }
  
  getTrainingQualityRecords(): FlywheelRecord[] {
    return this.getRecords().filter(r => r.qualitySignals?.overallScore !== undefined && r.qualitySignals.overallScore >= QUALITY_THRESHOLD);
  }
  
  exportForTraining(): string[] {
    return this.getTrainingQualityRecords().map(r => {
      const messages = [{ role: "system", content: r.systemPrompt }, ...r.conversationHistory, { role: "user", content: r.userMessage }, { role: "assistant", content: r.assistantResponse }];
      return JSON.stringify({ messages });
    });
  }
  
  exportForNIM(): string[] {
    return this.getTrainingQualityRecords().map(r => {
      const conversations = [{ from: "system", value: r.systemPrompt }, ...r.conversationHistory.map(m => ({ from: m.role, value: m.content })), { from: "human", value: r.userMessage }, { from: "gpt", value: r.assistantResponse }];
      const toolCalls = r.toolCalls.length > 0 ? r.toolCalls.map(tc => ({ name: tc.toolName, arguments: tc.arguments, result: tc.result, success: tc.success })) : undefined;
      return JSON.stringify({ conversations, tool_calls: toolCalls, metadata: { model: r.model, mode: r.mode, workload_id: r.workloadId, quality_score: r.qualitySignals?.overallScore, latency_ms: r.latencyMs } });
    });
  }
  
  exportWithToolCalls(): string[] {
    return this.getTrainingQualityRecords().filter(r => r.toolCalls.length > 0).map(r => {
      const toolCallsFormatted = r.toolCalls.map(tc => ({ name: tc.toolName, arguments: tc.arguments }));
      return JSON.stringify({ messages: [{ role: "system", content: r.systemPrompt }, ...r.conversationHistory, { role: "user", content: r.userMessage }], tools: toolCallsFormatted, assistant_response: r.assistantResponse });
    });
  }
  
  getStats(): { totalRecords: number; byWorkloadType: Record<string, number>; avgLatencyMs: number; avgToolCalls: number; errorRate: number } {
    const records = this.getRecords();
    if (records.length === 0) return { totalRecords: 0, byWorkloadType: {}, avgLatencyMs: 0, avgToolCalls: 0, errorRate: 0 };
    
    const byWorkloadType: Record<string, number> = {};
    let totalLatency = 0, totalToolCalls = 0, totalErrors = 0;
    
    for (const r of records) {
      const type = identifyWorkloadType(r.toolCalls);
      byWorkloadType[type] = (byWorkloadType[type] || 0) + 1;
      totalLatency += r.latencyMs;
      totalToolCalls += r.toolCalls.length;
      totalErrors += r.toolCalls.filter(t => !t.success).length;
    }
    
    return { totalRecords: records.length, byWorkloadType, avgLatencyMs: totalLatency / records.length, avgToolCalls: totalToolCalls / records.length, errorRate: totalToolCalls > 0 ? totalErrors / totalToolCalls : 0 };
  }
  
  clear(): void {
    const key = `${this.clientId}:${this.workloadId}`;
    recordStore.delete(key);
  }
}

let globalLogger: FlywheelLogger | null = null;

export function getFlywheelLogger(options?: { clientId?: string; workloadId?: string; enabled?: boolean }): FlywheelLogger {
  if (!globalLogger) globalLogger = new FlywheelLogger(options);
  return globalLogger;
}

export function resetFlywheelLogger(): void {
  globalLogger = null;
}
