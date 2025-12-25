// Trajectory Scorer - Binary reward based on structural + functional correctness

export interface ScoringConfig {
  functionalThreshold: number;
  structuralThreshold: number;
}

export function computeReward(
  record: {
    structural?: { score: number };
    functional?: { score: number };
  },
  cfg: ScoringConfig = { functionalThreshold: 0.8, structuralThreshold: 0.8 }
): number {
  const structuralOk = (record.structural?.score ?? 0) >= cfg.structuralThreshold;
  const functionalOk = (record.functional?.score ?? 0) >= cfg.functionalThreshold;
  return structuralOk && functionalOk ? 1 : 0;
}
