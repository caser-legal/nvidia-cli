/**
 * Data Flywheel Logger
 * Captures agent interactions for continuous model improvement
 * NVIDIA-Compatible: Creates records matching NVIDIA Data Flywheel Blueprint schema
 */

import {
  FlywheelRecord,
  ToolCallRecord,
  QualitySignals,
  WorkloadClassification,
  QUALITY_THRESHOLD,
  NVIDIARequest,
  NVIDIAResponse,
  ChatMessage,
  toNVIDIALogFormat,
} from "./types";
import { ingestToElasticsearch } from "./elasticsearch-sink";
import { routeToTrainingDir } from "./quality-filter";
import { createLogger } from "../../logger";
import * as fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import * as path from "path";

const log = createLogger("Flywheel");

// In-memory store for current session
const recordStore: Map<string, FlywheelRecord[]> = new Map();

// File-based persistence for durability
const HOME_DIR = "/Users/home" || "home" || "/tmp";
const FLYWHEEL_DIR = path.join(HOME_DIR, ".nvidia-cli", "flywheel");
const NVIDIA_EXPORT_DIR = path.join(FLYWHEEL_DIR, "nvidia-export");

// Ensure directories exist on module load
try {
  if (!existsSync(FLYWHEEL_DIR)) {
    mkdirSync(FLYWHEEL_DIR, { recursive: true });
    log.info(`Created flywheel directory: ${FLYWHEEL_DIR}`);
  }
  if (!existsSync(NVIDIA_EXPORT_DIR)) {
    mkdirSync(NVIDIA_EXPORT_DIR, { recursive: true });
  }
} catch (e) {
  log.error(`Failed to create flywheel directory: ${e}`);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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

function calculateQualitySignals(response: string, toolCalls: ToolCallRecord[]): QualitySignals {
  return {
    responseLength: response.length,
    toolCallCount: toolCalls.length,
    errorCount: toolCalls.filter((t) => !t.success).length,
  };
}

/**
 * Build NVIDIA-compatible request object from interaction params
 */
function buildNVIDIARequest(params: LogInteractionParams): NVIDIARequest {
  const messages: ChatMessage[] = [];
  
  // System prompt
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  
  // Conversation history
  for (const msg of params.conversationHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }
  
  // Current user message
  messages.push({ role: "user", content: params.userMessage });
  
  return {
    model: params.model,
    messages,
    temperature: 0.6,
    max_tokens: 16384,
  };
}

/**
 * Build NVIDIA-compatible response object from interaction params
 */
function buildNVIDIAResponse(params: LogInteractionParams, recordId: string): NVIDIAResponse {
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: params.assistantResponse,
  };
  
  // Add tool calls if present
  if (params.toolCalls.length > 0) {
    assistantMessage.tool_calls = params.toolCalls.map((tc, idx) => ({
      id: `call_${recordId}_${idx}`,
      type: "function" as const,
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }
  
  return {
    id: `chatcmpl-${recordId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [{
      index: 0,
      message: assistantMessage,
      finish_reason: params.toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: params.tokenUsage.promptTokens,
      completion_tokens: params.tokenUsage.completionTokens,
      total_tokens: params.tokenUsage.totalTokens,
    },
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
  private initialized: boolean = false;

  constructor(options: { clientId?: string; workloadId?: string; enabled?: boolean } = {}) {
    this.clientId = options.clientId || "nvidia-cli";
    this.workloadId = options.workloadId || `workload-${Date.now()}`;
    this.enabled = options.enabled ?? true;
    
    this.loadFromDisk().catch(e => log.debug("Failed to load existing records", { error: String(e) }));
  }

  private async loadFromDisk(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(FLYWHEEL_DIR, { recursive: true });
      const files = await fs.readdir(FLYWHEEL_DIR);
      const key = `${this.clientId}:${this.workloadId}`;
      
      if (!recordStore.has(key)) {
        recordStore.set(key, []);
      }
      
      let loaded = 0;
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await fs.readFile(path.join(FLYWHEEL_DIR, file), "utf-8");
          const record = JSON.parse(content) as FlywheelRecord;
          if (record.workloadId === this.workloadId) {
            recordStore.get(key)!.push(record);
            loaded++;
          }
        } catch {
          // Skip invalid files
        }
      }
      
      if (loaded > 0) {
        log.info(`Loaded ${loaded} existing flywheel records`);
      }
      
      this.initialized = true;
    } catch (e) {
      log.debug("Failed to load from disk", { error: String(e) });
      this.initialized = true;
    }
  }

  /**
   * Log an interaction to the flywheel
   * Creates both internal format and NVIDIA-compatible export
   */
  async logInteraction(params: LogInteractionParams): Promise<FlywheelRecord | null> {
    if (!this.enabled) return null;

    const recordId = generateId();
    
    // Build NVIDIA-compatible request/response
    const nvidiaRequest = buildNVIDIARequest(params);
    const nvidiaResponse = buildNVIDIAResponse(params, recordId);

    const record: FlywheelRecord = {
      id: recordId,
      timestamp: new Date().toISOString(),
      clientId: this.clientId,
      workloadId: this.workloadId,
      
      // NVIDIA-compatible format
      request: nvidiaRequest,
      response: nvidiaResponse,
      
      // Legacy format for backward compatibility
      userMessage: params.userMessage,
      assistantResponse: params.assistantResponse,
      systemPrompt: params.systemPrompt,
      conversationHistory: params.conversationHistory,
      toolCalls: params.toolCalls,
      
      model: params.model,
      mode: params.mode,
      tokenUsage: {
        promptTokens: params.tokenUsage.promptTokens,
        completionTokens: params.tokenUsage.completionTokens,
        totalTokens: params.tokenUsage.totalTokens,
      },
      latencyMs: params.latencyMs,
      qualitySignals: calculateQualitySignals(params.assistantResponse, params.toolCalls),
      workloadType: identifyWorkloadType(params.toolCalls),
    };

    // Store in memory
    const key = `${this.clientId}:${this.workloadId}`;
    if (!recordStore.has(key)) recordStore.set(key, []);
    recordStore.get(key)!.push(record);

    // Persist to file
    const persisted = await this.persistToFile(record);
    
    // Also export in NVIDIA format
    await this.exportNVIDIAFormat(record);

    // Persist to Elasticsearch (async, don't block)
    ingestToElasticsearch(record).catch((err) => {
      log.debug("ES persist failed (non-blocking)", { error: err.message });
    });

    log.info(`Logged interaction ${record.id}`, {
      workloadType: record.workloadType,
      toolCalls: record.toolCalls.length,
      persisted,
    });

    return record;
  }

  /**
   * Persist record to local file
   */
  private async persistToFile(record: FlywheelRecord): Promise<boolean> {
    try {
      await fs.mkdir(FLYWHEEL_DIR, { recursive: true });
      const filename = `${record.id}.json`;
      const filepath = path.join(FLYWHEEL_DIR, filename);
      await fs.writeFile(filepath, JSON.stringify(record, null, 2));
      return true;
    } catch (e) {
      log.error("File persist failed", { error: String(e), recordId: record.id });
      return false;
    }
  }

  /**
   * Export record in NVIDIA Data Flywheel format
   * This creates files compatible with NVIDIA's data flywheel tooling
   */
  private async exportNVIDIAFormat(record: FlywheelRecord): Promise<void> {
    try {
      await fs.mkdir(NVIDIA_EXPORT_DIR, { recursive: true });
      const nvidiaRecord = toNVIDIALogFormat(record);
      const filename = `${record.workloadId}-${record.id}.jsonl`;
      const filepath = path.join(NVIDIA_EXPORT_DIR, filename);
      await fs.appendFile(filepath, JSON.stringify(nvidiaRecord) + "\n");
    } catch (e) {
      log.debug("NVIDIA export failed", { error: String(e) });
    }
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

    await this.persistToFile(record);

    try {
      await routeToTrainingDir(record);
    } catch (err) {
      log.debug("Training dir routing failed", { error: String(err) });
    }

    ingestToElasticsearch(record).catch((err) => {
      log.debug("ES update failed", { error: err.message });
    });

    log.info(`Evaluation scores persisted for ${recordId}`, { 
      overallScore: scores.overallScore,
    });
    
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

    this.persistToFile(record);
    
    if (record.qualitySignals.overallScore !== undefined || rating >= 4) {
      routeToTrainingDir(record).catch(() => {});
    }

    log.info(`User feedback added to ${recordId}`, { rating });
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
      if (r.qualitySignals?.overallScore !== undefined) {
        return r.qualitySignals.overallScore >= minScore;
      }
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
   * Export records in NVIDIA Data Flywheel format (JSONL)
   */
  exportForNVIDIA(): string[] {
    return this.getRecords().map((r) => JSON.stringify(toNVIDIALogFormat(r)));
  }

  /**
   * Export records with tool calls
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
   * Get statistics
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
        persistenceDir: FLYWHEEL_DIR,
        nvidiaExportDir: NVIDIA_EXPORT_DIR,
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
      persistenceDir: FLYWHEEL_DIR,
      nvidiaExportDir: NVIDIA_EXPORT_DIR,
    };
  }

  clear(): void {
    const key = `${this.clientId}:${this.workloadId}`;
    recordStore.delete(key);
    log.info("Cleared flywheel records", { key });
  }
  
  getWorkloadId(): string {
    return this.workloadId;
  }
}

// Singleton management
let globalLogger: FlywheelLogger | null = null;
let globalLoggerOptions: { clientId?: string; workloadId?: string; enabled?: boolean } | null = null;

export function getFlywheelLogger(
  options?: { clientId?: string; workloadId?: string; enabled?: boolean }
): FlywheelLogger {
  if (!globalLogger) {
    globalLogger = new FlywheelLogger(options);
    globalLoggerOptions = options || null;
    log.info("Created flywheel logger singleton", { 
      workloadId: globalLogger.getWorkloadId(),
      enabled: options?.enabled ?? true,
    });
  } else if (options && globalLoggerOptions) {
    if (options.workloadId && options.workloadId !== globalLoggerOptions.workloadId) {
      log.warn("getFlywheelLogger called with different workloadId, using existing", {
        existing: globalLoggerOptions.workloadId,
        requested: options.workloadId,
      });
    }
  }
  return globalLogger;
}

export function resetFlywheelLogger(): void {
  globalLogger = null;
  globalLoggerOptions = null;
}

export type { FlywheelRecord, ToolCallRecord, QualitySignals } from "./types";
export { QUALITY_THRESHOLD } from "./types";
