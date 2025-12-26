/**
 * Trajectory Scorer
 * Computes binary reward for flywheel records based on quality signals
 */

import { FlywheelRecord, QUALITY_THRESHOLD } from "./types";

export interface ScoringConfig {
  qualityThreshold: number;
  minResponseLength: number;
  maxErrorRate: number;
}

const DEFAULT_CONFIG: ScoringConfig = {
  qualityThreshold: QUALITY_THRESHOLD,
  minResponseLength: 50,
  maxErrorRate: 0.5,
};

/**
 * Compute binary reward (0 or 1) for a flywheel record
 * 
 * @param record - The flywheel record to score
 * @param config - Scoring configuration
 * @returns 1 for high-quality (SFT), 0 for low-quality (DPO)
 */
export function computeReward(record: FlywheelRecord, config: ScoringConfig = DEFAULT_CONFIG): number {
  const signals = record.qualitySignals;
  
  // No quality signals = low quality
  if (!signals) return 0;
  
  // Check LLM-as-Judge overall score (primary signal)
  if (signals.overallScore !== undefined) {
    return signals.overallScore >= config.qualityThreshold ? 1 : 0;
  }
  
  // Fall back to user rating (convert 1-5 scale to 0-10)
  if (signals.userRating !== undefined) {
    const normalizedRating = signals.userRating * 2;
    return normalizedRating >= config.qualityThreshold ? 1 : 0;
  }
  
  // Fall back to heuristics
  const heuristicScore = computeHeuristicScore(record, config);
  return heuristicScore >= config.qualityThreshold ? 1 : 0;
}

/**
 * Compute a heuristic quality score when no explicit rating is available
 */
function computeHeuristicScore(record: FlywheelRecord, config: ScoringConfig): number {
  let score = 5; // Start at neutral
  
  const signals = record.qualitySignals;
  if (!signals) return score;
  
  // Response length bonus/penalty
  if (signals.responseLength >= config.minResponseLength * 2) {
    score += 1;
  } else if (signals.responseLength < config.minResponseLength) {
    score -= 2;
  }
  
  // Tool success rate
  if (signals.toolCallCount > 0) {
    const errorRate = signals.errorCount / signals.toolCallCount;
    if (errorRate === 0) {
      score += 2; // Perfect tool execution
    } else if (errorRate <= 0.2) {
      score += 1; // Mostly successful
    } else if (errorRate > config.maxErrorRate) {
      score -= 2; // Too many errors
    }
  }
  
  // Latency consideration (fast responses are often better)
  if (record.latencyMs < 5000) {
    score += 0.5;
  } else if (record.latencyMs > 30000) {
    score -= 0.5;
  }
  
  return Math.max(0, Math.min(10, score));
}

/**
 * Compute detailed scores for a record
 */
export function computeDetailedScores(record: FlywheelRecord): {
  overall: number;
  responseQuality: number;
  toolExecution: number;
  efficiency: number;
} {
  const signals = record.qualitySignals;
  
  // Response quality (0-10)
  let responseQuality = 5;
  if (signals) {
    if (signals.responseLength >= 200) responseQuality += 2;
    else if (signals.responseLength < 50) responseQuality -= 2;
    
    if (signals.helpfulness !== undefined) {
      responseQuality = (responseQuality + signals.helpfulness) / 2;
    }
  }
  
  // Tool execution (0-10)
  let toolExecution = 10; // Perfect if no tools
  if (signals && signals.toolCallCount > 0) {
    const successRate = 1 - (signals.errorCount / signals.toolCallCount);
    toolExecution = successRate * 10;
    
    if (signals.toolSelection !== undefined) {
      toolExecution = (toolExecution + signals.toolSelection) / 2;
    }
  }
  
  // Efficiency (0-10)
  let efficiency = 5;
  if (record.latencyMs < 3000) efficiency = 9;
  else if (record.latencyMs < 10000) efficiency = 7;
  else if (record.latencyMs < 30000) efficiency = 5;
  else efficiency = 3;
  
  if (signals?.efficiency !== undefined) {
    efficiency = (efficiency + signals.efficiency) / 2;
  }
  
  // Overall (weighted average)
  const overall = responseQuality * 0.5 + toolExecution * 0.3 + efficiency * 0.2;
  
  return {
    overall: Math.round(overall * 10) / 10,
    responseQuality: Math.round(responseQuality * 10) / 10,
    toolExecution: Math.round(toolExecution * 10) / 10,
    efficiency: Math.round(efficiency * 10) / 10,
  };
}
