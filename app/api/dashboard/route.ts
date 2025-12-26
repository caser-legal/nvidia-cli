/**
 * Dashboard Metrics API
 * Returns daily volume, reward distribution, error rate, and more
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@elastic/elasticsearch";
import { QUALITY_THRESHOLD } from "@/lib/agents/flywheel/types";
import { getTrainingStats } from "@/lib/agents/flywheel/quality-filter";
import { getDLQStats } from "@/lib/agents/flywheel/elasticsearch-sink";

const ES_ENDPOINT = process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200";
const ES_INDEX = "nvidia-cli-traces";

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({ node: ES_ENDPOINT });
  }
  return client;
}

export async function GET(req: NextRequest) {
  try {
    const esClient = getClient();

    // Get all documents
    let hits: any[] = [];
    try {
      const allDocs = await esClient.search({
        index: ES_INDEX,
        size: 1000,
        sort: [{ timestamp: "desc" }],
      });
      hits = allDocs.hits.hits.map((h: any) => h._source);
    } catch (esError) {
      // ES might not be running
      console.warn("[dashboard] ES query failed:", esError);
    }

    // Daily volume
    const dailyVolume: Record<string, number> = {};
    hits.forEach((doc: any) => {
      const ts = doc.timestamp;
      if (ts) {
        const date = new Date(typeof ts === "number" ? ts : parseInt(ts)).toISOString().split("T")[0];
        dailyVolume[date] = (dailyVolume[date] || 0) + 1;
      }
    });

    // Reward distribution - use _original.qualitySignals if available, fall back to quality.structural
    let sftCount = 0;
    let dpoCount = 0;
    let unevaluatedCount = 0;

    hits.forEach((doc: any) => {
      // Try _original.qualitySignals.overallScore first (our format)
      const overallScore = doc._original?.qualitySignals?.overallScore;
      if (overallScore !== undefined) {
        if (overallScore >= QUALITY_THRESHOLD) sftCount++;
        else dpoCount++;
        return;
      }

      // Fall back to NAT format quality.structural.score
      const structuralScore = doc.quality?.structural?.score;
      if (structuralScore !== undefined) {
        // NAT format is 0-1, convert to 0-10
        const normalizedScore = structuralScore * 10;
        if (normalizedScore >= QUALITY_THRESHOLD) sftCount++;
        else dpoCount++;
        return;
      }

      // No quality signal
      unevaluatedCount++;
    });

    // Error rate (last 5 min)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentDocs = hits.filter((doc: any) => {
      const ts = typeof doc.timestamp === "number" ? doc.timestamp : parseInt(doc.timestamp);
      return ts >= fiveMinAgo;
    });
    const errorCount = recentDocs.filter((doc: any) => doc.error_details).length;
    const errorRate = recentDocs.length > 0 ? errorCount / recentDocs.length : 0;

    // Model distribution
    const modelDistribution: Record<string, number> = {};
    hits.forEach((doc: any) => {
      const model = doc._original?.model || "unknown";
      modelDistribution[model] = (modelDistribution[model] || 0) + 1;
    });

    // Workload type distribution
    const workloadDistribution: Record<string, number> = {};
    hits.forEach((doc: any) => {
      const workload = doc._original?.workloadType || "generic";
      workloadDistribution[workload] = (workloadDistribution[workload] || 0) + 1;
    });

    // Average latency
    let totalLatency = 0;
    let latencyCount = 0;
    hits.forEach((doc: any) => {
      const latency = doc.response?.latencyMs;
      if (latency) {
        totalLatency += latency;
        latencyCount++;
      }
    });
    const avgLatencyMs = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

    // Average quality score
    let totalScore = 0;
    let scoreCount = 0;
    hits.forEach((doc: any) => {
      const score = doc._original?.qualitySignals?.overallScore ?? doc.quality?.structural?.score * 10;
      if (score !== undefined && !isNaN(score)) {
        totalScore += score;
        scoreCount++;
      }
    });
    const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;

    // Training directory stats
    let trainingStats = { sft: { count: 0, totalSize: 0 }, dpo: { count: 0, totalSize: 0 } };
    try {
      trainingStats = await getTrainingStats();
    } catch {
      // Directories might not exist
    }

    // DLQ stats
    let dlqStats: { count: number; oldestFailure?: string } = { count: 0 };
    try {
      dlqStats = await getDLQStats();
    } catch {
      // DLQ might not exist
    }

    return NextResponse.json({
      // Core metrics
      totalDocs: hits.length,
      dailyVolume,
      
      // Quality distribution
      rewardDistribution: [
        { reward: "SFT (High Quality)", count: sftCount },
        { reward: "DPO (Needs Work)", count: dpoCount },
        { reward: "Unevaluated", count: unevaluatedCount },
      ],
      
      // Error tracking
      errorRate,
      recentErrorCount: errorCount,
      recentDocsCount: recentDocs.length,
      
      // Performance
      avgLatencyMs,
      avgScore,
      
      // Distributions
      modelDistribution,
      workloadDistribution,
      
      // Training data
      trainingStats,
      
      // DLQ
      dlqStats,
      
      // Thresholds (for UI)
      qualityThreshold: QUALITY_THRESHOLD,
      errorThreshold: 0.05,
    });
  } catch (e: any) {
    console.error("[dashboard/metrics] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
