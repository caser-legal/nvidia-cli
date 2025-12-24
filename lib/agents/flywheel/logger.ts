// Data Flywheel Logger
// Captures agent interactions for continuous model improvement
// Based on NVIDIA Data Flywheel Blueprint

import { 
  FlywheelRecord, 
  ToolCallRecord, 
  QualitySignals,
  WorkloadClassification 
} from "./types";

// In-memory store with eviction to prevent OOM
const recordStore: Map<string, FlywheelRecord[]> = new Map();
const MAX_RECORDS_PER_WORKLOAD = 500;

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Identify workload type from tool calls
function identifyWorkloadType(toolCalls: ToolCallRecord[]): WorkloadClassification {
  const toolNames = toolCalls.map(t => t.toolName);
  
  // Check for research patterns
  if (toolNames.some(n => 
    n.includes("search") || 
    n.includes("research") || 
    n === "search_specialist"
  )) {
    return WorkloadClassification.RESEARCH;
  }
  
  // Check for coding patterns
  if (toolNames.some(n => 
    n === "file_write" || 
    n === "bash" ||
    n.includes("code")
  )) {
    return WorkloadClassification.CODING;
  }
  
  // Check for tool calling patterns
  if (toolCalls.length > 0) {
    return WorkloadClassification.TOOL_CALLING;
  }
  
  return WorkloadClassification.GENERIC;
}

// Calculate quality signals from a record
function calculateQualitySignals(
  response: string,
  toolCalls: ToolCallRecord[]
): QualitySignals {
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
  
  constructor(options: {
    clientId?: string;
    workloadId?: string;
    enabled?: boolean;
  } = {}) {
    this.clientId = options.clientId || "default";
    this.workloadId = options.workloadId || `workload-${Date.now()}`;
    this.enabled = options.enabled ?? true;
  }
  
  // Log a complete agent interaction
  logInteraction(params: {
    userMessage: string;
    assistantResponse: string;
    systemPrompt: string;
    conversationHistory: Array<{ role: string; content: string }>;
    toolCalls: ToolCallRecord[];
    model: string;
    mode: string;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
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
      qualitySignals: calculateQualitySignals(
        params.assistantResponse,
        params.toolCalls
      ),
    };
    
    // Store record with eviction
    const key = `${this.clientId}:${this.workloadId}`;
    if (!recordStore.has(key)) {
      recordStore.set(key, []);
    }
    const records = recordStore.get(key)!;
    
    // Evict oldest records if at capacity
    while (records.length >= MAX_RECORDS_PER_WORKLOAD) {
      records.shift();
    }
    records.push(record);
    
    console.log(`[Flywheel] Logged interaction ${record.id} for ${key} (${records.length}/${MAX_RECORDS_PER_WORKLOAD})`);
    return record;
  }
  
  // Add user feedback to a record
  addUserFeedback(recordId: string, rating: number, feedback?: string): boolean {
    const key = `${this.clientId}:${this.workloadId}`;
    const records = recordStore.get(key);
    if (!records) return false;
    
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    
    record.qualitySignals = {
      ...record.qualitySignals!,
      userRating: rating,
      userFeedback: feedback,
    };
    
    console.log(`[Flywheel] Added feedback to ${recordId}: ${rating}/5`);
    return true;
  }
  
  // Get records for a workload
  getRecords(): FlywheelRecord[] {
    const key = `${this.clientId}:${this.workloadId}`;
    return recordStore.get(key) || [];
  }
  
  // Get records filtered by quality
  getHighQualityRecords(minRating: number = 4): FlywheelRecord[] {
    return this.getRecords().filter(r => 
      r.qualitySignals?.userRating && 
      r.qualitySignals.userRating >= minRating
    );
  }
  
  // Export records in OpenAI fine-tuning format
  exportForTraining(): string[] {
    const records = this.getRecords();
    return records.map(r => {
      const messages = [
        { role: "system", content: r.systemPrompt },
        ...r.conversationHistory,
        { role: "user", content: r.userMessage },
        { role: "assistant", content: r.assistantResponse },
      ];
      return JSON.stringify({ messages });
    });
  }
  
  // Export records with tool calls (for tool-calling fine-tuning)
  exportWithToolCalls(): string[] {
    const records = this.getRecords().filter(r => r.toolCalls.length > 0);
    return records.map(r => {
      const toolCallsFormatted = r.toolCalls.map(tc => ({
        name: tc.toolName,
        arguments: tc.arguments,
      }));
      
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
  
  // Get statistics
  getStats(): {
    totalRecords: number;
    byWorkloadType: Record<string, number>;
    avgLatencyMs: number;
    avgToolCalls: number;
    errorRate: number;
  } {
    const records = this.getRecords();
    if (records.length === 0) {
      return {
        totalRecords: 0,
        byWorkloadType: {},
        avgLatencyMs: 0,
        avgToolCalls: 0,
        errorRate: 0,
      };
    }
    
    const byWorkloadType: Record<string, number> = {};
    let totalLatency = 0;
    let totalToolCalls = 0;
    let totalErrors = 0;
    
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
  
  // Clear records (for testing)
  clear(): void {
    const key = `${this.clientId}:${this.workloadId}`;
    recordStore.delete(key);
  }
}

// Singleton instance for global logging
let globalLogger: FlywheelLogger | null = null;

export function getFlywheelLogger(options?: {
  clientId?: string;
  workloadId?: string;
  enabled?: boolean;
}): FlywheelLogger {
  if (!globalLogger) {
    globalLogger = new FlywheelLogger(options);
  }
  return globalLogger;
}

export function resetFlywheelLogger(): void {
  globalLogger = null;
}
