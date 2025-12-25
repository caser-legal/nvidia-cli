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

export async function ingestFlywheelRecord(record: FlywheelRecord): Promise<void> {
  const payload = {
    contract_version: "1.1" as const,
    request: {
      method: record.request?.method ?? "UNKNOWN",
      url: record.request?.url ?? "UNKNOWN",
      args: record.request?.args ?? {},
    },
    response: {
      status: record.response?.status ?? 0,
      data: record.response?.data,
      latencyMs: record.response?.latencyMs ?? 0,
    },
    client_id: record.client_id,
    workload_id: record.workload_id,
    timestamp: record.timestamp,
    ...(record.error_details && { error_details: record.error_details }),
    ...(record.quality && { quality: record.quality }),
  };

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const result = await esClient.index({
        index: "nvidia-cli-traces",
        id: `${record.workload_id}-${record.timestamp}`,
        body: payload,
      });
      if (result.result === "created" || result.result === "updated") {
        logger.info(`Indexed: ${record.workload_id}-${record.timestamp}`);
        return;
      }
    } catch (err: any) {
      const status = err?.statusCode ?? err?.meta?.statusCode ?? 0;
      const shouldRetry = ["429", "5"].some((s) => String(status).startsWith(s)) || err?.message?.includes("timeout");

      if (shouldRetry && attempt < MAX_RETRIES - 1) {
        const delay = backoffDelay(attempt);
        logger.warn(`Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delay)}ms (status=${status})`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      // Permanent failure → DLQ
      await writeDLQ({ original: record, error: JSON.stringify(err), failedAt: Date.now() });
      logger.error("Giving up after retries – stored to DLQ");
      return;
    }
  }
  logger.error("Max retries exceeded – record dropped");
}
