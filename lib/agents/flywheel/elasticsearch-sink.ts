/**
 * Elasticsearch Sink
 * Persists flywheel records to Elasticsearch with retry logic and DLQ
 */

import { Client } from "@elastic/elasticsearch";
import { FlywheelRecord, DLQRecord, toNATFormat } from "./types";
import { writeFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "../../logger";

const log = createLogger("ES-Sink");

// Configuration
const ES_ENDPOINT = process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200";
const ES_INDEX = "nvidia-cli-traces";
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;
const DLQ_DIR = path.resolve(process.cwd(), "dlq");

// Lazy client initialization
let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({ node: ES_ENDPOINT });
  }
  return client;
}

/**
 * Exponential backoff with jitter
 */
function getBackoffMs(attempt: number): number {
  const base = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * base;
  return Math.min(base + jitter, 30000); // Cap at 30s
}

/**
 * Check if error is retryable
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors, 429, 5xx
    if (message.includes("econnrefused") || message.includes("timeout") || message.includes("network")) {
      return true;
    }
  }
  // Check for HTTP status codes
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 429 || (statusCode && statusCode >= 500)) {
    return true;
  }
  return false;
}

/**
 * Write record to Dead Letter Queue
 */
async function writeToDLQ(record: FlywheelRecord, error: string, retryCount: number): Promise<void> {
  try {
    await mkdir(DLQ_DIR, { recursive: true });
    
    const dlqRecord: DLQRecord = {
      original: record,
      error,
      failedAt: new Date().toISOString(),
      retryCount,
    };
    
    const filename = `${record.id}.json`;
    await writeFile(path.join(DLQ_DIR, filename), JSON.stringify(dlqRecord, null, 2));
    log.warn(`Record ${record.id} written to DLQ after ${retryCount} retries`, { error });
  } catch (dlqError) {
    log.error("Failed to write to DLQ", { error: String(dlqError), recordId: record.id });
  }
}

/**
 * Ingest a flywheel record to Elasticsearch with retry logic
 */
export async function ingestToElasticsearch(record: FlywheelRecord): Promise<boolean> {
  const esClient = getClient();
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Convert to NAT format for ES storage
      const natRecord = toNATFormat(record);
      
      await esClient.index({
        index: ES_INDEX,
        id: record.id,
        document: {
          ...natRecord,
          // Also store original format for dashboard queries
          _original: {
            userMessage: record.userMessage,
            assistantResponse: record.assistantResponse,
            toolCalls: record.toolCalls,
            qualitySignals: record.qualitySignals,
            workloadType: record.workloadType,
            model: record.model,
            mode: record.mode,
          },
        },
      });
      
      log.debug(`Indexed record ${record.id} to ES`, { attempt: attempt + 1 });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (isRetryable(error) && attempt < MAX_RETRIES - 1) {
        const backoff = getBackoffMs(attempt);
        log.warn(`ES indexing failed, retrying in ${backoff}ms`, {
          recordId: record.id,
          attempt: attempt + 1,
          error: errorMessage,
        });
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      
      // Non-retryable or max retries exceeded
      await writeToDLQ(record, errorMessage, attempt + 1);
      return false;
    }
  }
  
  return false;
}

/**
 * Bulk ingest multiple records
 */
export async function bulkIngest(records: FlywheelRecord[]): Promise<{ success: number; failed: number }> {
  const esClient = getClient();
  let success = 0;
  let failed = 0;
  
  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    const operations = batch.flatMap((record) => {
      const natRecord = toNATFormat(record);
      return [
        { index: { _index: ES_INDEX, _id: record.id } },
        {
          ...natRecord,
          _original: {
            userMessage: record.userMessage,
            assistantResponse: record.assistantResponse,
            toolCalls: record.toolCalls,
            qualitySignals: record.qualitySignals,
            workloadType: record.workloadType,
            model: record.model,
            mode: record.mode,
          },
        },
      ];
    });
    
    try {
      const result = await esClient.bulk({ operations, refresh: true });
      
      if (result.errors) {
        for (const item of result.items) {
          if (item.index?.error) {
            failed++;
            const recordId = item.index._id;
            const record = batch.find((r) => r.id === recordId);
            if (record) {
              await writeToDLQ(record, JSON.stringify(item.index.error), 1);
            }
          } else {
            success++;
          }
        }
      } else {
        success += batch.length;
      }
    } catch (error) {
      log.error("Bulk ingest failed", { error: String(error), batchStart: i });
      failed += batch.length;
      // Write all to DLQ
      for (const record of batch) {
        await writeToDLQ(record, String(error), 1);
      }
    }
  }
  
  log.info(`Bulk ingest complete`, { success, failed, total: records.length });
  return { success, failed };
}

/**
 * Retry records from DLQ
 */
export async function retryDLQ(): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  try {
    await mkdir(DLQ_DIR, { recursive: true });
    const files = await readdir(DLQ_DIR);
    
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      
      const filePath = path.join(DLQ_DIR, file);
      const content = await readFile(filePath, "utf-8");
      const dlqRecord: DLQRecord = JSON.parse(content);
      
      const ingested = await ingestToElasticsearch(dlqRecord.original);
      if (ingested) {
        await unlink(filePath);
        success++;
      } else {
        failed++;
      }
    }
    
    log.info(`DLQ retry complete`, { success, failed });
  } catch (error) {
    log.error("DLQ retry failed", { error: String(error) });
  }
  
  return { success, failed };
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{ count: number; oldestFailure?: string }> {
  try {
    await mkdir(DLQ_DIR, { recursive: true });
    const files = await readdir(DLQ_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    
    if (jsonFiles.length === 0) {
      return { count: 0 };
    }
    
    // Find oldest
    let oldestFailure: string | undefined;
    for (const file of jsonFiles.slice(0, 1)) {
      const content = await readFile(path.join(DLQ_DIR, file), "utf-8");
      const dlqRecord: DLQRecord = JSON.parse(content);
      oldestFailure = dlqRecord.failedAt;
    }
    
    return { count: jsonFiles.length, oldestFailure };
  } catch {
    return { count: 0 };
  }
}

/**
 * Ensure ES index exists with proper mapping
 */
export async function ensureIndex(): Promise<void> {
  const esClient = getClient();
  
  try {
    const exists = await esClient.indices.exists({ index: ES_INDEX });
    if (exists) return;
    
    await esClient.indices.create({
      index: ES_INDEX,
      mappings: {
        properties: {
          contract_version: { type: "keyword" },
          client_id: { type: "keyword" },
          workload_id: { type: "keyword" },
          timestamp: { type: "date", format: "epoch_millis" },
          error_details: { type: "text" },
          "request.method": { type: "keyword" },
          "request.url": { type: "keyword" },
          "response.status": { type: "integer" },
          "response.latencyMs": { type: "integer" },
          "quality.structural.score": { type: "float" },
          "quality.functional.score": { type: "float" },
          "_original.userMessage": { type: "text" },
          "_original.assistantResponse": { type: "text" },
          "_original.workloadType": { type: "keyword" },
          "_original.model": { type: "keyword" },
          "_original.mode": { type: "keyword" },
          "_original.qualitySignals.overallScore": { type: "float" },
        },
      },
    });
    
    log.info(`Created ES index: ${ES_INDEX}`);
  } catch (error) {
    // Index might already exist or ES not available
    log.debug("Index creation skipped", { error: String(error) });
  }
}

// Legacy export for backward compatibility
export { ingestToElasticsearch as ingestFlywheelRecord };
