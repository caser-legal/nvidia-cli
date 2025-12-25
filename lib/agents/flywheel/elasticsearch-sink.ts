// Elasticsearch Sink - Export FlywheelRecord to ES with retry + DLQ

import { Client } from "@elastic/elasticsearch";
import { FlywheelRecord, DLQRecord } from "./types";
import { writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

const esClient = new Client({
  node: process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200",
});

// Retry constants (mirrors NAT RetryMixin)
const BASE_DELAY_MS = 200;
const MAX_DELAY_MS = 5000;
const MAX_RETRIES = 5;
const JITTER_FACTOR = 0.3;

function backoffDelay(attempt: number): number {
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  const jitter = delay * JITTER_FACTOR * (Math.random() - 0.5);
  return delay + jitter;
}

async function writeDLQ(record: DLQRecord): Promise<void> {
  const dlqPath = path.resolve(process.cwd(), "dlq");
  await mkdir(dlqPath, { recursive: true });
  const filename = `dlq-${Date.now()}.json`;
  await writeFile(path.join(dlqPath, filename), JSON.stringify(record, null, 2));
  logger.warn(`DLQ record written: ${filename}`);
}

export async function ingestFlywheelRecord(record: any): Promise<void> {
  // Convert logger format to Elasticsearch format
  const payload = {
    contract_version: "1.1" as const,
    id: record.id,
    timestamp: record.timestamp,
    client_id: record.clientId,
    workload_id: record.workloadId,
    user_message: record.userMessage,
    assistant_response: record.assistantResponse,
    system_prompt: record.systemPrompt,
    conversation_history: record.conversationHistory,
    tool_calls: record.toolCalls,
    model: record.model,
    mode: record.mode,
    token_usage: record.tokenUsage,
    latency_ms: record.latencyMs,
    quality_signals: record.qualitySignals,
  };

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const result = await esClient.index({
        index: "nvidia-cli-flywheel",
        id: record.id,
        body: payload,
      });
      if (result.result === "created" || result.result === "updated") {
        console.log(`[Flywheel] Indexed to Elasticsearch: ${record.id}`);
        return;
      }
    } catch (err: any) {
      const status = err?.statusCode ?? err?.meta?.statusCode ?? 0;
      const shouldRetry = ["429", "5"].some((s) => String(status).startsWith(s)) || err?.message?.includes("timeout");

      if (shouldRetry && attempt < MAX_RETRIES - 1) {
        const delay = backoffDelay(attempt);
        console.warn(`[Flywheel] Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delay)}ms (status=${status})`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      // Permanent failure → DLQ
      await writeDLQ({ original: record, error: JSON.stringify(err), failedAt: Date.now() });
      console.error("[Flywheel] Giving up after retries – stored to DLQ");
      return;
    }
  }
  console.error("[Flywheel] Max retries exceeded – record dropped");
}
