/**
 * Data Flywheel Types - Unified Schema
 * Compatible with both internal logging and NVIDIA NAT export
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum FlywheelRunStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed",
}

export enum WorkloadClassification {
  GENERIC = "generic",
  TOOL_CALLING = "tool_calling",
  RESEARCH = "research",
  CODING = "coding",
}

export enum EvalType {
  BASE = "base-eval",
  ICL = "icl-eval",
  CUSTOMIZED = "customized-eval",
}

// ============================================================================
// TOOL CALL RECORD
// ============================================================================

export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// QUALITY SIGNALS - Unified scoring
// ============================================================================

export interface QualitySignals {
  // LLM-as-Judge scores (0-10 scale)
  overallScore?: number;
  helpfulness?: number;
  accuracy?: number;
  completeness?: number;
  clarity?: number;
  safety?: number;
  
  // Tool-specific scores (0-10 scale)
  toolSelection?: number;
  argumentAccuracy?: number;
  executionOrder?: number;
  resultIntegration?: number;
  efficiency?: number;
  
  // User feedback
  userRating?: number;  // 1-5 scale
  userFeedback?: string;
  
  // Computed metrics
  responseLength: number;
  toolCallCount: number;
  errorCount: number;
  
  // Evaluation metadata
  reasoning?: string;
  evaluatedAt?: string;
}

// ============================================================================
// FLYWHEEL RECORD - Main unified schema
// ============================================================================

export interface FlywheelRecord {
  // Core identity
  id: string;
  timestamp: string;  // ISO 8601 string
  clientId: string;
  workloadId: string;
  
  // Conversation data
  userMessage: string;
  assistantResponse: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  toolCalls: ToolCallRecord[];
  
  // Model info
  model: string;
  mode: string;
  
  // Performance metrics
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  
  // Quality assessment
  qualitySignals?: QualitySignals;
  
  // Classification
  workloadType?: WorkloadClassification;
  
  // Error tracking
  errorDetails?: string;
}

// ============================================================================
// NAT EXPORT FORMAT - For NVIDIA Data Flywheel compatibility
// ============================================================================

export interface NATExportRecord {
  contract_version: "1.1";
  request: {
    method: string;
    url: string;
    args?: Record<string, unknown>;
  };
  response: {
    status: number;
    data?: string;
    latencyMs?: number;
  };
  client_id: string;
  workload_id: string;
  timestamp: number;  // Unix timestamp
  error_details?: string;
  quality?: {
    structural?: { score: number };
    functional?: { score: number };
  };
}

/**
 * Convert FlywheelRecord to NAT export format
 */
export function toNATFormat(record: FlywheelRecord): NATExportRecord {
  const overallScore = record.qualitySignals?.overallScore ?? 5;
  const normalizedScore = overallScore / 10;  // Convert 0-10 to 0-1
  
  return {
    contract_version: "1.1",
    request: {
      method: "POST",
      url: "/api/agent-chat",
      args: { userMessage: record.userMessage },
    },
    response: {
      status: record.errorDetails ? 500 : 200,
      data: record.assistantResponse,
      latencyMs: record.latencyMs,
    },
    client_id: record.clientId,
    workload_id: record.workloadId,
    timestamp: new Date(record.timestamp).getTime(),
    error_details: record.errorDetails,
    quality: {
      structural: { score: normalizedScore },
      functional: { score: normalizedScore },
    },
  };
}

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

export interface DLQRecord {
  original: FlywheelRecord;
  error: string;
  failedAt: string;
  retryCount: number;
}

// ============================================================================
// DATASET TYPES
// ============================================================================

export interface FlywheelDataset {
  name: string;
  type: "train" | "base" | "icl";
  records: FlywheelRecord[];
  numRecords: number;
  createdAt: string;
  workloadId: string;
}

export interface EvaluationResult {
  jobId: string;
  evalType: EvalType;
  scores: Record<string, number>;
  startedAt: string;
  finishedAt: string;
  runtimeSeconds: number;
  progress: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const QUALITY_THRESHOLD = 7;  // 0-10 scale, records >= 7 go to SFT
export const MIN_RESPONSE_LENGTH = 50;
export const MAX_ERROR_RATE = 0.5;
