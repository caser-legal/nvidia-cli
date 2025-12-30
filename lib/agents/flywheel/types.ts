/**
 * Data Flywheel Types - NVIDIA-Compatible Schema
 * Based on NVIDIA Data Flywheel Blueprint (https://github.com/NVIDIA-AI-Blueprints/data-flywheel)
 */

// ============================================================================
// ENUMS - Matching NVIDIA spec exactly
// ============================================================================

export enum FlywheelRunStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed",
}

// NVIDIA spec only has GENERIC and TOOL_CALLING
// We keep RESEARCH and CODING for internal use but they map to GENERIC for export
export enum WorkloadClassification {
  GENERIC = "generic",
  TOOL_CALLING = "tool_calling",
  RESEARCH = "research",   // Internal only - maps to GENERIC for NVIDIA export
  CODING = "coding",       // Internal only - maps to GENERIC for NVIDIA export
}

export enum EvalType {
  BASE = "base-eval",
  ICL = "icl-eval",
  CUSTOMIZED = "customized-eval",
}

// ============================================================================
// NVIDIA-COMPATIBLE MESSAGE FORMAT
// ============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;  // JSON string per OpenAI spec
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ============================================================================
// NVIDIA LOG SCHEMA - Exact match to data-flywheel spec
// ============================================================================

/**
 * NVIDIA-compatible request format
 * Matches openai.ChatCompletion.create payload
 */
export interface NVIDIARequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

/**
 * NVIDIA-compatible response format
 * Matches ChatCompletion response
 */
export interface NVIDIAResponse {
  id: string;
  object: "chat.completion";
  created: number;  // Unix timestamp
  model: string;
  choices: ChatCompletionChoice[];
  usage: TokenUsage;
}

/**
 * NVIDIA Data Flywheel Log Record
 * This is the EXACT schema expected by NVIDIA's data flywheel
 */
export interface NVIDIALogRecord {
  timestamp: number;  // Unix epoch seconds
  workload_id: string;
  client_id: string;
  request: NVIDIARequest;
  response: NVIDIAResponse;
}

// ============================================================================
// TOOL CALL RECORD - Internal tracking
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
// FLYWHEEL RECORD - Extended internal format
// ============================================================================

export interface FlywheelRecord {
  // Core identity
  id: string;
  timestamp: string;  // ISO 8601 for internal use
  clientId: string;
  workloadId: string;
  
  // NVIDIA-compatible request/response (NEW)
  request: NVIDIARequest;
  response: NVIDIAResponse;
  
  // Legacy fields for backward compatibility
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
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert FlywheelRecord to NVIDIA Log format for export
 */
export function toNVIDIALogFormat(record: FlywheelRecord): NVIDIALogRecord {
  return {
    timestamp: Math.floor(new Date(record.timestamp).getTime() / 1000),
    workload_id: record.workloadId,
    client_id: record.clientId,
    request: record.request,
    response: record.response,
  };
}

/**
 * Convert FlywheelRecord to NAT export format (legacy)
 */
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
  timestamp: number;
  error_details?: string;
  quality?: {
    structural?: { score: number };
    functional?: { score: number };
  };
}

export function toNATFormat(record: FlywheelRecord): NATExportRecord {
  const overallScore = record.qualitySignals?.overallScore ?? 5;
  const normalizedScore = overallScore / 10;
  
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

/**
 * Map internal workload classification to NVIDIA-compatible value
 */
export function toNVIDIAWorkloadType(type: WorkloadClassification): "generic" | "tool_calling" {
  if (type === WorkloadClassification.TOOL_CALLING) {
    return "tool_calling";
  }
  return "generic";
}

// ============================================================================
// DATA SPLIT CONFIG - Matching NVIDIA spec
// ============================================================================

export interface DataSplitConfig {
  evalSize: number;           // Size of evaluation set (default: 20)
  valRatio: number;           // Validation ratio (default: 0.1)
  minTotalRecords: number;    // Minimum total records (default: 50)
  randomSeed?: number;        // Random seed for reproducibility
  limit: number;              // Limit on records to evaluate (default: 10000)
  parseFunctionArguments: boolean;  // Parse function arguments to JSON (default: true)
}

export const DEFAULT_DATA_SPLIT_CONFIG: DataSplitConfig = {
  evalSize: 20,
  valRatio: 0.1,
  minTotalRecords: 50,
  limit: 10000,
  parseFunctionArguments: true,
};

// ============================================================================
// ICL CONFIG - Matching NVIDIA spec
// ============================================================================

export interface ICLConfig {
  maxContextLength: number;   // Maximum context length (default: 8192)
  reservedTokens: number;     // Reserved tokens (default: 2048)
  maxExamples: number;        // Maximum examples (default: 3)
  minExamples: number;        // Minimum examples (default: 1)
  exampleSelection: "uniform_distribution" | "semantic_similarity";
}

export const DEFAULT_ICL_CONFIG: ICLConfig = {
  maxContextLength: 8192,
  reservedTokens: 2048,
  maxExamples: 3,
  minExamples: 1,
  exampleSelection: "uniform_distribution",
};

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
// CONSTANTS - Matching NVIDIA defaults
// ============================================================================

export const QUALITY_THRESHOLD = 7;  // 0-10 scale, records >= 7 go to SFT
export const MIN_RESPONSE_LENGTH = 50;
export const MAX_ERROR_RATE = 0.5;
