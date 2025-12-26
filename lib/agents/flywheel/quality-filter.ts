/**
 * Quality Filter
 * Routes flywheel records to SFT or DPO training directories based on quality scores
 */

import { FlywheelRecord, QUALITY_THRESHOLD, MIN_RESPONSE_LENGTH, MAX_ERROR_RATE } from "./types";
import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "../../logger";

const log = createLogger("QualityFilter");

// Training directories
const SFT_DIR = path.resolve(process.cwd(), "sft_traces");
const DPO_DIR = path.resolve(process.cwd(), "dpo_traces");

/**
 * Compute binary reward based on quality signals
 * Returns 1 for high-quality (SFT), 0 for low-quality (DPO)
 */
export function computeReward(record: FlywheelRecord): number {
  const signals = record.qualitySignals;
  if (!signals) return 0;

  // Check LLM-as-Judge score (primary signal)
  if (signals.overallScore !== undefined) {
    return signals.overallScore >= QUALITY_THRESHOLD ? 1 : 0;
  }

  // Fall back to user rating (convert 1-5 to 0-10 scale)
  if (signals.userRating !== undefined) {
    return signals.userRating * 2 >= QUALITY_THRESHOLD ? 1 : 0;
  }

  // No quality signal available
  return 0;
}

/**
 * Validate record meets minimum quality bar for training
 */
export function isValidForTraining(record: FlywheelRecord): boolean {
  // Must have user message and response
  if (!record.userMessage || !record.assistantResponse) {
    return false;
  }

  // Response must be substantial
  if (record.assistantResponse.length < MIN_RESPONSE_LENGTH) {
    return false;
  }

  // Check error rate if tools were used
  const signals = record.qualitySignals;
  if (signals && signals.toolCallCount > 0) {
    const errorRate = signals.errorCount / signals.toolCallCount;
    if (errorRate > MAX_ERROR_RATE) {
      return false;
    }
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

  // Add tool calls if present
  if (record.toolCalls.length > 0) {
    const toolCalls = record.toolCalls.map((tc) => ({
      type: "function",
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.arguments),
      },
    }));

    messages.push({
      role: "assistant",
      content: record.assistantResponse,
      tool_calls: toolCalls,
    } as { role: string; content: string; tool_calls?: unknown[] });
  } else {
    messages.push({
      role: "assistant",
      content: record.assistantResponse,
    });
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
  // Validate record
  if (!isValidForTraining(record)) {
    log.debug(`Record ${record.id} not valid for training`);
    return null;
  }

  // Must have quality signal
  if (record.qualitySignals?.overallScore === undefined && record.qualitySignals?.userRating === undefined) {
    log.debug(`Record ${record.id} has no quality signal, skipping`);
    return null;
  }

  // Compute reward and determine directory
  const reward = computeReward(record);
  const targetDir = reward === 1 ? SFT_DIR : DPO_DIR;
  const label = reward === 1 ? "SFT" : "DPO";

  // Ensure directory exists
  await mkdir(targetDir, { recursive: true });

  // Write record
  const filename = `${record.clientId}-${record.id}.json`;
  const filePath = path.join(targetDir, filename);
  const trainingData = toTrainingFormat(record);

  await writeFile(filePath, JSON.stringify(trainingData, null, 2));

  log.info(`Routed record to ${label}`, {
    recordId: record.id,
    score: record.qualitySignals?.overallScore,
    path: filePath,
  });

  return filePath;
}

/**
 * Get statistics for training directories
 */
export async function getTrainingStats(): Promise<{
  sft: { count: number; totalSize: number };
  dpo: { count: number; totalSize: number };
}> {
  const stats = {
    sft: { count: 0, totalSize: 0 },
    dpo: { count: 0, totalSize: 0 },
  };

  for (const [dir, key] of [
    [SFT_DIR, "sft"],
    [DPO_DIR, "dpo"],
  ] as const) {
    try {
      await mkdir(dir, { recursive: true });
      const files = await readdir(dir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      stats[key].count = jsonFiles.length;

      // Calculate total size
      for (const file of jsonFiles) {
        const content = await readFile(path.join(dir, file), "utf-8");
        stats[key].totalSize += content.length;
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  return stats;
}

/**
 * Export all training data as JSONL
 */
export async function exportAsJSONL(type: "sft" | "dpo" | "all"): Promise<string> {
  const lines: string[] = [];

  const dirs = type === "all" ? [SFT_DIR, DPO_DIR] : type === "sft" ? [SFT_DIR] : [DPO_DIR];

  for (const dir of dirs) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await readFile(path.join(dir, file), "utf-8");
        const record = JSON.parse(content);
        // JSONL format: one JSON object per line
        lines.push(JSON.stringify(record));
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return lines.join("\n");
}

/**
 * Create DPO pairs from SFT and DPO records
 * DPO format: { prompt, chosen, rejected }
 */
export async function createDPOPairs(): Promise<
  Array<{ prompt: string; chosen: string; rejected: string }>
> {
  const pairs: Array<{ prompt: string; chosen: string; rejected: string }> = [];

  try {
    // Load SFT records (chosen)
    const sftFiles = await readdir(SFT_DIR);
    const sftRecords: Map<string, { prompt: string; response: string }> = new Map();

    for (const file of sftFiles) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(path.join(SFT_DIR, file), "utf-8");
      const record = JSON.parse(content);
      const userMsg = record.messages?.find((m: { role: string }) => m.role === "user")?.content;
      const assistantMsg = record.messages?.find((m: { role: string }) => m.role === "assistant")?.content;
      if (userMsg && assistantMsg) {
        sftRecords.set(userMsg.slice(0, 100), { prompt: userMsg, response: assistantMsg });
      }
    }

    // Load DPO records (rejected) and match with SFT
    const dpoFiles = await readdir(DPO_DIR);
    for (const file of dpoFiles) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(path.join(DPO_DIR, file), "utf-8");
      const record = JSON.parse(content);
      const userMsg = record.messages?.find((m: { role: string }) => m.role === "user")?.content;
      const assistantMsg = record.messages?.find((m: { role: string }) => m.role === "assistant")?.content;

      if (userMsg && assistantMsg) {
        // Try to find matching SFT record
        const key = userMsg.slice(0, 100);
        const sftMatch = sftRecords.get(key);
        if (sftMatch) {
          pairs.push({
            prompt: userMsg,
            chosen: sftMatch.response,
            rejected: assistantMsg,
          });
        }
      }
    }
  } catch {
    // Directories don't exist
  }

  return pairs;
}
