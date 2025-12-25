// Data Flywheel Types - Based on NVIDIA NAT DFWESRecord schema

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

// NAT DFWESRecord-compatible schema
export interface FlywheelRecord {
  contract_version: "1.1" | "1.0";
  request: {
    method: string;
    url: string;
    args?: Record<string, any>;
  };
  response: {
    status: number;
    data?: any;
    latencyMs?: number;
  };
  client_id: string;
  workload_id: string;
  timestamp: number;
  error_details?: string;
  
  // Extended fields for quality scoring
  quality?: {
    structural?: { score: number };
    functional?: { score: number };
  };
}

// Dead Letter Queue record for failed indexing
export interface DLQRecord {
  original: FlywheelRecord;
  error: string;
  failedAt: number;
}

export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface QualitySignals {
  userRating?: number;
  userFeedback?: string;
  responseLength: number;
  toolCallCount: number;
  errorCount: number;
  similarity?: number;
  correctness?: number;
  helpfulness?: number;
  accuracy?: number;
}
