import * as os from "os";
/**
 * Elasticsearch Sink
 * Persists flywheel records to Elasticsearch with retry logic and DLQ
 * Falls back to file-based storage when ES is unavailable
 */

import { Client } from "@elastic/elasticsearch";
import { FlywheelRecord, DLQRecord, toNATFormat } from "./types";
import { writeFile, mkdir, readdir, readFile, unlink, appendFile } from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "../../logger";

const log = createLogger("ES-Sink");

// Configuration
const ES_ENDPOINT = "http://localhost:9200" ?? "http://localhost:9200";
const ES_INDEX = "nvidia-cli-traces";
const MAX_RETRIES = 3; // Reduced for faster fallback
const INITIAL_BACKOFF_MS = 500;
const HOME_DIR = process.env.HOME || os.homedir();
const DLQ_DIR = path.join(HOME_DIR, ".nvidia-cli", "flywheel", "dlq");
const FALLBACK_DIR = path.join(HOME_DIR, ".nvidia-cli", "flywheel", "records");

// Track ES availability to avoid repeated connection attempts
let esAvailable: boolean | null = null;
let lastEsCheck = 0;
const ES_CHECK_INTERVAL_MS = 60000; // Re-check ES availability every 60s

// Lazy client initialization
let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({ node: ES_ENDPOINT });
  }
  return client;
}

/**
 * Check if Elasticsearch is available
 */
async function checkEsAvailability(): Promise<boolean> {
  const now = Date.now();
  
  // Use cached result if recent
  if (esAvailable !== null && (now - lastEsCheck) < ES_CHECK_INTERVAL_MS) {
    return esAvailable;
  }
  
  try {
    const esClient = getClient();
    await esClient.ping();
    esAvailable = true;
    lastEsCheck = now;
    log.info("Elasticsearch is available");
    return true;
  } catch {
    esAvailable = false;
    lastEsCheck = now;
    log.warn("Elasticsearch unavailable - using file-based fallback");
    return false;
  }
}

/**
 * Exponential backoff with jitter
 */
function getBackoffMs(attempt: number): number {
  const base = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * base;
  return Math.min(base + jitter, 10000); // Cap at 10s
}

/**
 * Check if error is retryable
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("econnrefused") || message.includes("timeout") || message.includes("network")) {
      return true;
    }
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 429 || (statusCode && statusCode >= 500)) {
    return true;
  }
  return false;
}

/**
 * Write record to file-based fallback storage
 */
async function writeToFallback(record: FlywheelRecord): Promise<void> {
  try {
    await mkdir(FALLBACK_DIR, { recursive: true });
    const filename = `records-${new Date().toISOString().split("T")[0]}.jsonl`;
    await appendFile(
      path.join(FALLBACK_DIR, filename),
      JSON.stringify(record) + "\n"
    );
    log.debug(`Record ${record.id} written to fallback storage`);
  } catch (error) {
    log.error("Failed to write to fallback storage", { error: String(error), recordId: record.id });
  }
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
 * Falls back to file storage when ES is unavailable
 */
export async function ingestToElasticsearch(record: FlywheelRecord): Promise<boolean> {
  // Check ES availability first
  const esUp = await checkEsAvailability();
  
  if (!esUp) {
    // Use file-based fallback
    await writeToFallback(record);
    return true; // Return true because record is persisted (just not to ES)
  }
  
  const esClient = getClient();
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const natRecord = toNATFormat(record);
      
      await esClient.index({
        index: ES_INDEX,
        id: record.id,
        document: {
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
      });
      
      log.debug(`Indexed record ${record.id} to ES`, { attempt: attempt + 1 });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Mark ES as unavailable on connection errors
      if (errorMessage.toLowerCase().includes("econnrefused")) {
        esAvailable = false;
        await writeToFallback(record);
        return true;
      }
      
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
      
      // Non-retryable or max retries exceeded - use fallback
      await writeToFallback(record);
      return true;
    }
  }
  
  return false;
}

/**
 * Bulk ingest multiple records
 */
export async function bulkIngest(records: FlywheelRecord[]): Promise<{ success: number; failed: number }> {
  const esUp = await checkEsAvailability();
  
  if (!esUp) {
    // Write all to fallback
    for (const record of records) {
      await writeToFallback(record);
    }
    return { success: records.length, failed: 0 };
  }
  
  const esClient = getClient();
  let success = 0;
  let failed = 0;
  
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
              await writeToFallback(record);
            }
          } else {
            success++;
          }
        }
      } else {
        success += batch.length;
      }
    } catch (error) {
      log.error("Bulk ingest failed, using fallback", { error: String(error), batchStart: i });
      // Write all to fallback
      for (const record of batch) {
        await writeToFallback(record);
      }
      success += batch.length; // Count as success since persisted to fallback
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
 * Get fallback storage statistics
 */
export async function getFallbackStats(): Promise<{ fileCount: number; totalRecords: number }> {
  try {
    await mkdir(FALLBACK_DIR, { recursive: true });
    const files = await readdir(FALLBACK_DIR);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    
    let totalRecords = 0;
    for (const file of jsonlFiles) {
      const content = await readFile(path.join(FALLBACK_DIR, file), "utf-8");
      totalRecords += content.split("\n").filter(Boolean).length;
    }
    
    return { fileCount: jsonlFiles.length, totalRecords };
  } catch {
    return { fileCount: 0, totalRecords: 0 };
  }
}

/**
 * Ensure ES index exists with proper mapping
 */
export async function ensureIndex(): Promise<void> {
  const esUp = await checkEsAvailability();
  if (!esUp) return;
  
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
    log.debug("Index creation skipped", { error: String(error) });
  }
}

/**
 * Check if ES is currently available (cached result)
 */
export function isElasticsearchAvailable(): boolean {
  return esAvailable === true;
}

/**
 * Force re-check of ES availability
 */
export async function recheckElasticsearch(): Promise<boolean> {
  lastEsCheck = 0; // Reset cache
  return checkEsAvailability();
}

// Legacy export for backward compatibility
export { ingestToElasticsearch as ingestFlywheelRecord };
