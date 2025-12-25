// Quality Filter - Route traces to sft_traces/ or dpo_traces/ based on reward

import { computeReward } from "./trajectory-scorer";
import { FlywheelRecord } from "./types";
import { writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

const SFT_DIR = path.resolve(process.cwd(), "sft_traces");
const DPO_DIR = path.resolve(process.cwd(), "dpo_traces");

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function processRecord(record: FlywheelRecord): Promise<void> {
  const reward = computeReward(
    { structural: record.quality?.structural, functional: record.quality?.functional },
    { functionalThreshold: 0.8, structuralThreshold: 0.8 }
  );

  const targetDir = reward === 1 ? SFT_DIR : DPO_DIR;
  await ensureDir(targetDir);

  const filename = `${record.client_id}-${record.timestamp}.json`;
  await writeFile(path.join(targetDir, filename), JSON.stringify(record, null, 2));
  logger.info(`Persisted → ${reward === 1 ? "SFT" : "DPO"}/${filename}`);
}
