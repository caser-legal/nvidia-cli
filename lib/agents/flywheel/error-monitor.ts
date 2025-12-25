// Error Rate Monitor - Checks every 5 min and logs alerts

import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node: process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200",
});

const THRESHOLD = 0.05; // 5%
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function checkErrorRate(): Promise<void> {
  try {
    const result = await client.search({
      index: "nvidia-cli-traces",
      size: 1000,
    });

    const hits = result.hits.hits.map((h: any) => h._source);
    const fiveMinAgo = Date.now() - INTERVAL_MS;
    
    const recent = hits.filter((doc: any) => {
      const ts = typeof doc.timestamp === "number" ? doc.timestamp : parseInt(doc.timestamp);
      return ts >= fiveMinAgo;
    });

    if (recent.length === 0) return;

    const errors = recent.filter((doc: any) => doc.error_details).length;
    const rate = errors / recent.length;

    if (rate > THRESHOLD) {
      console.warn(`⚠️ [error-monitor] Error rate ${(rate * 100).toFixed(1)}% exceeds ${THRESHOLD * 100}% threshold`);
      
      // Optional: POST to webhook
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `⚠️ Error rate alert: ${(rate * 100).toFixed(1)}%` }),
        });
      }
    }
  } catch (e) {
    // ES might not be running - silently skip
  }
}

let intervalId: NodeJS.Timeout | null = null;

export function startErrorMonitor(): void {
  if (intervalId) return;
  console.log("[error-monitor] Started (checking every 5 min)");
  checkErrorRate();
  intervalId = setInterval(checkErrorRate, INTERVAL_MS);
}

export function stopErrorMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
