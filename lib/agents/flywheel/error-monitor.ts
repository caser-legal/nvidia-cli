/**
 * Error Rate Monitor
 * Checks error rate every 5 minutes and alerts if above threshold
 */

import { Client } from "@elastic/elasticsearch";
import { createLogger } from "../../logger";

const log = createLogger("ErrorMonitor");

const ES_ENDPOINT = process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200";
const ES_INDEX = "nvidia-cli-traces";
const ERROR_THRESHOLD = 0.05; // 5%
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let client: Client | null = null;
let intervalId: NodeJS.Timeout | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({ node: ES_ENDPOINT });
  }
  return client;
}

/**
 * Check error rate for recent documents
 */
async function checkErrorRate(): Promise<void> {
  try {
    const esClient = getClient();

    // Get documents from last 5 minutes
    const fiveMinAgo = Date.now() - CHECK_INTERVAL_MS;

    const result = await esClient.search({
      index: ES_INDEX,
      size: 1000,
      query: {
        range: {
          timestamp: {
            gte: fiveMinAgo,
          },
        },
      },
    });

    const hits = result.hits.hits.map((h: any) => h._source);

    if (hits.length === 0) {
      log.debug("No recent documents to check");
      return;
    }

    // Count errors
    const errors = hits.filter((doc: any) => doc.error_details).length;
    const rate = errors / hits.length;

    log.debug(`Error rate check`, {
      total: hits.length,
      errors,
      rate: `${(rate * 100).toFixed(1)}%`,
    });

    if (rate > ERROR_THRESHOLD) {
      log.warn(`⚠️ Error rate ${(rate * 100).toFixed(1)}% exceeds ${ERROR_THRESHOLD * 100}% threshold`, {
        total: hits.length,
        errors,
      });

      // Send alert to webhook if configured
      await sendAlert(rate, errors, hits.length);
    }
  } catch (e) {
    // ES might not be running - silently skip
    log.debug("Error rate check skipped", { error: String(e) });
  }
}

/**
 * Send alert to configured webhook
 */
async function sendAlert(rate: number, errors: number, total: number): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠️ *Flywheel Error Rate Alert*\n\nError rate: ${(rate * 100).toFixed(1)}%\nErrors: ${errors}/${total} in last 5 minutes\nThreshold: ${ERROR_THRESHOLD * 100}%`,
      }),
    });
    log.info("Alert sent to webhook");
  } catch (e) {
    log.error("Failed to send alert", { error: String(e) });
  }
}

/**
 * Start the error monitor
 */
export function startErrorMonitor(): void {
  if (intervalId) {
    log.warn("Error monitor already running");
    return;
  }

  log.info(`Error monitor started (checking every ${CHECK_INTERVAL_MS / 1000}s, threshold: ${ERROR_THRESHOLD * 100}%)`);

  // Run immediately
  checkErrorRate();

  // Then run on interval
  intervalId = setInterval(checkErrorRate, CHECK_INTERVAL_MS);
}

/**
 * Stop the error monitor
 */
export function stopErrorMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info("Error monitor stopped");
  }
}

/**
 * Check if monitor is running
 */
export function isMonitorRunning(): boolean {
  return intervalId !== null;
}

/**
 * Get current error rate (for API)
 */
export async function getCurrentErrorRate(): Promise<{
  rate: number;
  errors: number;
  total: number;
  isAboveThreshold: boolean;
}> {
  try {
    const esClient = getClient();
    const fiveMinAgo = Date.now() - CHECK_INTERVAL_MS;

    const result = await esClient.search({
      index: ES_INDEX,
      size: 1000,
      query: {
        range: {
          timestamp: {
            gte: fiveMinAgo,
          },
        },
      },
    });

    const hits = result.hits.hits.map((h: any) => h._source);
    const errors = hits.filter((doc: any) => doc.error_details).length;
    const rate = hits.length > 0 ? errors / hits.length : 0;

    return {
      rate,
      errors,
      total: hits.length,
      isAboveThreshold: rate > ERROR_THRESHOLD,
    };
  } catch {
    return { rate: 0, errors: 0, total: 0, isAboveThreshold: false };
  }
}
