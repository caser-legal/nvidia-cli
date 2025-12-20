// Data Flywheel Types
// Based on NVIDIA Data Flywheel Blueprint for continuous model improvement

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

// Record of a single agent interaction
export interface FlywheelRecord {
  id: string;
  timestamp: string;
  clientId: string;
  workloadId: string;
  
  // Input/Output
  userMessage: string;
  assistantResponse: string;
  
  // Context
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  
  // Tool usage
  toolCalls: ToolCallRecord[];
  
  // Metadata
  model: string;
  mode: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  
  // Quality signals (for future LLM-as-judge evaluation)
  qualitySignals?: QualitySignals;
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
  // User feedback (if available)
  userRating?: number; // 1-5
  userFeedback?: string;
  
  // Automatic signals
  responseLength: number;
  toolCallCount: number;
  errorCount: number;
  
  // LLM-as-judge scores (populated by evaluation)
  similarity?: number;
  correctness?: number;
  helpfulness?: number;
}

// Batch of records for training
export interface FlywheelDataset {
  name: string;
  type: "base" | "icl" | "train";
  records: FlywheelRecord[];
  numRecords: number;
  createdAt: string;
  workloadId: string;
}

// Evaluation result
export interface EvaluationResult {
  jobId: string;
  evalType: EvalType;
  scores: Record<string, number>;
  startedAt: string;
  finishedAt?: string;
  runtimeSeconds: number;
  progress: number;
}

// Flywheel run tracking
export interface FlywheelRun {
  id: string;
  workloadId: string;
  clientId: string;
  status: FlywheelRunStatus;
  startedAt: string;
  finishedAt?: string;
  numRecords: number;
  datasets: FlywheelDataset[];
  evaluations: EvaluationResult[];
  error?: string;
}
