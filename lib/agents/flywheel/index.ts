/**
 * Flywheel Module Index
 * Re-exports all flywheel components
 */

// Types
export type {
  FlywheelRecord,
  ToolCallRecord,
  QualitySignals,
  FlywheelDataset,
  EvaluationResult,
  DLQRecord,
  NATExportRecord,
} from "./types";

export {
  FlywheelRunStatus,
  WorkloadClassification,
  EvalType,
  QUALITY_THRESHOLD,
  MIN_RESPONSE_LENGTH,
  MAX_ERROR_RATE,
  toNATFormat,
} from "./types";

// Logger
export type { LogInteractionParams } from "./logger";

export {
  FlywheelLogger,
  getFlywheelLogger,
  resetFlywheelLogger,
} from "./logger";

// Elasticsearch
export {
  ingestToElasticsearch,
  ingestFlywheelRecord,
  bulkIngest,
  retryDLQ,
  getDLQStats,
  ensureIndex,
} from "./elasticsearch-sink";

// Quality Filter
export {
  computeReward,
  isValidForTraining,
  routeToTrainingDir,
  getTrainingStats,
  exportAsJSONL,
  createDPOPairs,
} from "./quality-filter";

// Trajectory Scorer
export type { ScoringConfig } from "./trajectory-scorer";

export {
  computeReward as computeTrajectoryReward,
  computeDetailedScores,
} from "./trajectory-scorer";

// Evaluator
export type { JudgeConfig } from "./evaluator";

export { FlywheelEvaluator } from "./evaluator";

// Dataset Creator
export type { DataSplitConfig } from "./dataset-creator";

export { DatasetCreator } from "./dataset-creator";

// Error Monitor
export {
  startErrorMonitor,
  stopErrorMonitor,
  isMonitorRunning,
  getCurrentErrorRate,
} from "./error-monitor";
