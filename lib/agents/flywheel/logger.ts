// Data Flywheel Logger
// Captures agent interactions for continuous model improvement
// Based on NVIDIA Data Flywheel Blueprint

import { 
  FlywheelRecord, 
  ToolCallRecord, 
  QualitySignals,
  WorkloadClassification 
} from "./types";
import { ingestFlywheelRecord } from "./elasticsearch-sink";

// In-memory store (replace with database in production)
const recordStore: Map<string, FlywheelRecord[]> = new Map();

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Identify workload type from tool calls
function identifyWorkloadType(toolCalls: ToolCallRecord[]): WorkloadClassification {
  const toolNames = toolCalls.map(t => t.toolName);
  
  if (toolNames.some(n => n.includes("search") || n.includes("research") || n === "search_specialist")) {
    return WorkloadClassification.RESEARCH;
  }
  if (toolNames.some(n => n === "file_write" || n === "bash" || n.includes("code"))) {
    return WorkloadClassification.CODING;
  }
  if (toolCalls.length > 0) {
    return WorkloadClassification.TOOL_CALLING;
  }
  return WorkloadClassification.GENERIC;
}

// Calculate quality signals from a record
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
  
  async logInteraction(params: {
    userMessage: string;
    assistantResponse: string;
    systemPrompt: string;
    conversationHistory: Array<{ role: string; content: string }>;
    toolCalls: ToolCallRecord[];
    model: string;
    mode: string;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    latencyMs: number;
  }): Promise<FlywheelRecord | null> {
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
    recordStore.get(key)!.push(record);
    
    // Save to Elasticsearch for persistence
    try {
      await ingestFlywheelRecord(record);
      console.log(`[Flywheel] Successfully saved to Elasticsearch: ${record.id}`);
    } catch (err) {
      console.error(`[Flywheel] Failed to save to Elasticsearch:`, err.message);
      // Don't let Elasticsearch errors crash the logger
    }
    
    console.log(`[Flywheel] Logged interaction ${record.id} for ${key} (saved to ES)`);
    return record;
  }
  
  addUserFeedback(recordId: string, rating: number, feedback?: string): boolean {
    const key = `${this.clientId}:${this.workloadId}`;
    const records = recordStore.get(key);
    if (!records) return false;
    
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    
    record.qualitySignals = { ...record.qualitySignals!, userRating: rating, userFeedback: feedback };
    console.log(`[Flywheel] Added feedback to ${recordId}: ${rating}/5`);
    return true;
  }
  
  getRecords(): FlywheelRecord[] {
    const key = `${this.clientId}:${this.workloadId}`;
    return recordStore.get(key) || [];
  }
  
  getHighQualityRecords(minRating: number = 4): FlywheelRecord[] {
    return this.getRecords().filter(r => r.qualitySignals?.userRating && r.qualitySignals.userRating >= minRating);
  }
  
  exportForTraining(): string[] {
    return this.getRecords().map(r => {
      const messages = [
        { role: "system", content: r.systemPrompt },
        ...r.conversationHistory,
        { role: "user", content: r.userMessage },
        { role: "assistant", content: r.assistantResponse },
      ];
      return JSON.stringify({ messages });
    });
  }
  
  exportWithToolCalls(): string[] {
    return this.getRecords().filter(r => r.toolCalls.length > 0).map(r => {
      const toolCallsFormatted = r.toolCalls.map(tc => ({ name: tc.toolName, arguments: tc.arguments }));
      return JSON.stringify({
        messages: [
          { role: "system", content: r.systemPrompt },
          ...r.conversationHistory,
          { role: "user", content: r.userMessage },
        ],
        tools: toolCallsFormatted,
        assistant_response: r.assistantResponse,
      });
    });
  }
  
  getStats() {
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
    
    return {
      totalRecords: records.length,
      byWorkloadType,
      avgLatencyMs: totalLatency / records.length,
      avgToolCalls: totalToolCalls / records.length,
      errorRate: totalToolCalls > 0 ? totalErrors / totalToolCalls : 0,
    };
  }
  
  clear(): void {
    const key = `${this.clientId}:${this.workloadId}`;
    recordStore.delete(key);
  }
}

// Singleton instance
let globalLogger: FlywheelLogger | null = null;

export function getFlywheelLogger(options?: { clientId?: string; workloadId?: string; enabled?: boolean }): FlywheelLogger {
  if (!globalLogger) globalLogger = new FlywheelLogger(options);
  return globalLogger;
}

export function resetFlywheelLogger(): void {
  globalLogger = null;
}


// Quality threshold for filtering records
export const QUALITY_THRESHOLD = 0.8;
