// Dashboard Metrics API - Returns daily volume, reward distribution, error rate

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node: process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200",
});

export async function GET(req: NextRequest) {
  try {
    // Get all documents and compute metrics in-memory (simpler for small datasets)
    const allDocs = await client.search({
      index: "nvidia-cli-traces",
      size: 1000,
      sort: [{ _score: "desc" }],
    });

    const hits = allDocs.hits.hits.map((h: any) => h._source);

    // Daily volume
    const dailyVolume: Record<string, number> = {};
    hits.forEach((doc: any) => {
      const ts = doc.timestamp;
      if (ts) {
        const date = new Date(typeof ts === "number" ? ts : parseInt(ts)).toISOString().split("T")[0];
        dailyVolume[date] = (dailyVolume[date] || 0) + 1;
      }
    });

    // Reward distribution
    let sftCount = 0, dpoCount = 0;
    hits.forEach((doc: any) => {
      const score = doc.quality?.structural?.score ?? 0;
      if (score >= 0.8) sftCount++;
      else dpoCount++;
    });

    // Error rate (last 5 min)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentDocs = hits.filter((doc: any) => {
      const ts = typeof doc.timestamp === "number" ? doc.timestamp : parseInt(doc.timestamp);
      return ts >= fiveMinAgo;
    });
    const errorCount = recentDocs.filter((doc: any) => doc.error_details).length;
    const errorRate = recentDocs.length > 0 ? errorCount / recentDocs.length : 0;

    return NextResponse.json({
      dailyVolume,
      rewardDistribution: [
        { reward: "SFT", count: sftCount },
        { reward: "DPO", count: dpoCount },
      ],
      errorRate,
      totalDocs: hits.length,
    });
  } catch (e: any) {
    console.error("[dashboard/metrics] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
