import * as os from "os";
/**
 * Quality Filter
 * Routes flywheel records to SFT or DPO training directories based on quality scores
 */

import { FlywheelRecord, QUALITY_THRESHOLD, MIN_RESPONSE_LENGTH, MAX_ERROR_RATE } from "./types";
import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { createLogger } from "../../logger";

const log = createLogger("QualityFilter");

// Training directories - use stable HOME path like logger.ts
const HOME_DIR = process.env.HOME || os.homedir();
const TRAINING_BASE = path.join(HOME_DIR, ".nvidia-cli", "training");
const SFT_DIR = path.join(TRAINING_BASE, "sft_traces");
const DPO_DIR = path.join(TRAINING_BASE, "dpo_traces");

// Ensure directories exist on module load
try {
  if (!existsSync(TRAINING_BASE)) mkdirSync(TRAINING_BASE, { recursive: true });
  if (!existsSync(SFT_DIR)) mkdirSync(SFT_DIR, { recursive: true });
  if (!existsSync(DPO_DIR)) mkdirSync(DPO_DIR, { recursive: true });
} catch (e) {
  log.error(`Failed to create training directories: ${e}`);
}

/**
 * Compute binary reward based on quality signals
 * Returns 1 for high-quality (SFT), 0 for low-quality (DPO)
 */
export function computeReward(record: FlywheelRecord): number {
  const signals = record.qualitySignals;
  if (!signals) return 0;

  if (signals.overallScore !== undefined) {
    return signals.overallScore >= QUALITY_THRESHOLD ? 1 : 0;
  }

  if (signals.userRating !== undefined) {
    return signals.userRating * 2 >= QUALITY_THRESHOLD ? 1 : 0;
  }

  return 0;
}

/**
 * Validate record meets minimum quality bar for training
 */
export function isValidForTraining(record: FlywheelRecord): boolean {
  if (!record.userMessage || !record.assistantResponse) return false;
  if (record.assistantResponse.length < MIN_RESPONSE_LENGTH) return false;

  const signals = record.qualitySignals;
  if (signals && signals.toolCallCount > 0) {
    const errorRate = signals.errorCount / signals.toolCallCount;
    if (errorRate > MAX_ERROR_RATE) return false;
  }

  return true;
}

/**
 * Convert record to OpenAI fine-tuning format
 */
function toTrainingFormat(record: FlywheelRecord): object {
  const messages = [
    { role: "system", content: record.systemPrompt },
    ...record.conversationHistory,
    { role: "user", content: record.userMessage },
  ];

  if (record.toolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: record.assistantResponse,
      tool_calls: record.toolCalls.map((tc) => ({
        type: "function",
        function: { name: tc.toolName, arguments: JSON.stringify(tc.arguments) },
      })),
    } as { role: string; content: string; tool_calls?: unknown[] });
  } else {
    messages.push({ role: "assistant", content: record.assistantResponse });
  }

  return {
    messages,
    metadata: {
      id: record.id,
      timestamp: record.timestamp,
      model: record.model,
      workloadType: record.workloadType,
      qualityScore: record.qualitySignals?.overallScore,
      latencyMs: record.latencyMs,
    },
  };
}

/**
 * Route a record to the appropriate training directory
 */
export async function routeToTrainingDir(record: FlywheelRecord): Promise<string | null> {
  if (!isValidForTraining(record)) {
    log.debug(`Record ${record.id} not valid for training`);
    return null;
  }

  if (record.qualitySignals?.overallScore === undefined && record.qualitySignals?.userRating === undefined) {
    log.debug(`Record ${record.id} has no quality signal, skipping`);
    return null;
  }

  const reward = computeReward(record);
  const targetDir = reward === 1 ? SFT_DIR : DPO_DIR;
  const label = reward === 1 ? "SFT" : "DPO";

  await mkdir(targetDir, { recursive: true });

  const filename = `${record.clientId}-${record.id}.json`;
  const filePath = path.join(targetDir, filename);
  await writeFile(filePath, JSON.stringify(toTrainingFormat(record), null, 2));

  log.info(`Routed record to ${label}`, { recordId: record.id, score: record.qualitySignals?.overallScore, path: filePath });
  return filePath;
}

/**
 * Get statistics for training directories
 */
export async function getTrainingStats(): Promise<{
  sft: { count: number; totalSize: number };
  dpo: { count: number; totalSize: number };
  basePath: string;
}> {
  const stats = { sft: { count: 0, totalSize: 0 }, dpo: { count: 0, totalSize: 0 }, basePath: TRAINING_BASE };

  for (const [dir, key] of [[SFT_DIR, "sft"], [DPO_DIR, "dpo"]] as const) {
    try {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
      stats[key].count = files.length;
      for (const file of files) {
        stats[key].totalSize += (await readFile(path.join(dir, file), "utf-8")).length;
      }
    } catch { /* ignore */ }
  }

  return stats;
}

/**
 * Export all training data as JSONL
 */
export async function exportAsJSONL(type: "sft" | "dpo" | "all"): Promise<string> {
  const dirs = type === "all" ? [SFT_DIR, DPO_DIR] : type === "sft" ? [SFT_DIR] : [DPO_DIR];
  const lines: string[] = [];

  for (const dir of dirs) {
    try {
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".json")) continue;
        lines.push(JSON.stringify(JSON.parse(await readFile(path.join(dir, file), "utf-8"))));
      }
    } catch { /* ignore */ }
  }

  return lines.join("\n");
}

/**
 * Create DPO pairs from SFT and DPO records
 */
export async function createDPOPairs(): Promise<Array<{ prompt: string; chosen: string; rejected: string }>> {
  const pairs: Array<{ prompt: string; chosen: string; rejected: string }> = [];

  try {
    const sftRecords = new Map<string, { prompt: string; response: string }>();

    for (const file of await readdir(SFT_DIR)) {
      if (!file.endsWith(".json")) continue;
      const record = JSON.parse(await readFile(path.join(SFT_DIR, file), "utf-8"));
      const userMsg = record.messages?.find((m: { role: string }) => m.role === "user")?.content;
      const assistantMsg = record.messages?.find((m: { role: string }) => m.role === "assistant")?.content;
      if (userMsg && assistantMsg) sftRecords.set(userMsg.slice(0, 100), { prompt: userMsg, response: assistantMsg });
    }

    for (const file of await readdir(DPO_DIR)) {
      if (!file.endsWith(".json")) continue;
      const record = JSON.parse(await readFile(path.join(DPO_DIR, file), "utf-8"));
      const userMsg = record.messages?.find((m: { role: string }) => m.role === "user")?.content;
      const assistantMsg = record.messages?.find((m: { role: string }) => m.role === "assistant")?.content;
      if (userMsg && assistantMsg) {
        const sftMatch = sftRecords.get(userMsg.slice(0, 100));
        if (sftMatch) pairs.push({ prompt: userMsg, chosen: sftMatch.response, rejected: assistantMsg });
      }
    }
  } catch { /* ignore */ }

  return pairs;
}

/** Get training directories path */
export function getTrainingDirs() {
  return { sft: SFT_DIR, dpo: DPO_DIR, base: TRAINING_BASE };
}
