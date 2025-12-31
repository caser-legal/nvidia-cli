/**
 * Flywheel API Server
 * Handles automatic conversation logging from external clients (Kiro CLI, etc.)
 */

import express from "express";
import { getFlywheelLogger, FlywheelRecord, QUALITY_THRESHOLD } from "./lib/agents/flywheel/index.ts";
import { routeToTrainingDir, getTrainingStats, exportAsJSONL } from "./lib/agents/flywheel/quality-filter.ts";
import { retryDLQ, getDLQStats, ensureIndex } from "./lib/agents/flywheel/elasticsearch-sink.ts";
import { startErrorMonitor, stopErrorMonitor, isMonitorRunning } from "./lib/agents/flywheel/error-monitor.ts";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = 3001;

// Initialize
const flywheelLogger = getFlywheelLogger({
  clientId: "flywheel-api",
  workloadId: `api-${Date.now()}`,
  enabled: true,
});

// Ensure ES index exists on startup
ensureIndex().catch(console.error);

// Start error monitor
startErrorMonitor();

// ============================================================================
// LOGGING ENDPOINTS
// ============================================================================

/**
 * Log an interaction
 * POST /api/flywheel/log
 */
app.post("/api/flywheel/log", async (req, res) => {
  try {
    const {
      user_message,
      assistant_response,
      system_prompt = "",
      conversation_history = [],
      tool_calls = [],
      model = "unknown",
      mode = "external",
      token_usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency_ms = 0,
    } = req.body;

    if (!user_message || !assistant_response) {
      return res.status(400).json({
        success: false,
        error: "user_message and assistant_response are required",
      });
    }

    const record = await flywheelLogger.logInteraction({
      userMessage: user_message,
      assistantResponse: assistant_response,
      systemPrompt: system_prompt,
      conversationHistory: conversation_history,
      toolCalls: tool_calls.map((tc: any) => ({
        toolName: tc.name || tc.toolName,
        arguments: tc.arguments || tc.args || {},
        result: tc.result || "",
        durationMs: tc.durationMs || 0,
        success: tc.success !== false,
        error: tc.error,
      })),
      model,
      mode,
      tokenUsage: {
        promptTokens: token_usage.promptTokens || token_usage.prompt_tokens || 0,
        completionTokens: token_usage.completionTokens || token_usage.completion_tokens || 0,
        totalTokens: token_usage.totalTokens || token_usage.total_tokens || 0,
      },
      latencyMs: latency_ms,
    });

    res.json({
      success: true,
      recordId: record?.id,
      timestamp: record?.timestamp,
    });
  } catch (error: any) {
    console.error("[Flywheel API] Log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add evaluation scores to a record
 * POST /api/flywheel/evaluate
 */
app.post("/api/flywheel/evaluate", async (req, res) => {
  try {
    const { record_id, scores } = req.body;

    if (!record_id || !scores) {
      return res.status(400).json({
        success: false,
        error: "record_id and scores are required",
      });
    }

    const success = await flywheelLogger.addEvaluationScores(record_id, scores);

    res.json({ success, recordId: record_id });
  } catch (error: any) {
    console.error("[Flywheel API] Evaluate error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add user feedback to a record
 * POST /api/flywheel/feedback
 */
app.post("/api/flywheel/feedback", async (req, res) => {
  try {
    const { record_id, rating, feedback } = req.body;

    if (!record_id || rating === undefined) {
      return res.status(400).json({
        success: false,
        error: "record_id and rating are required",
      });
    }

    const success = flywheelLogger.addUserFeedback(record_id, rating, feedback);

    res.json({ success, recordId: record_id });
  } catch (error: any) {
    console.error("[Flywheel API] Feedback error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STATS ENDPOINTS
// ============================================================================

/**
 * Get flywheel statistics
 * GET /api/flywheel/stats
 */
app.get("/api/flywheel/stats", async (req, res) => {
  try {
    const stats = flywheelLogger.getStats();
    const trainingStats = await getTrainingStats();
    const dlqStats = await getDLQStats();

    res.json({
      ...stats,
      trainingStats,
      dlqStats,
      qualityThreshold: QUALITY_THRESHOLD,
      errorMonitorRunning: isMonitorRunning(),
    });
  } catch (error: any) {
    console.error("[Flywheel API] Stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all records
 * GET /api/flywheel/records
 */
app.get("/api/flywheel/records", (req, res) => {
  try {
    const records = flywheelLogger.getRecords();
    res.json({ records, count: records.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get high-quality records
 * GET /api/flywheel/records/high-quality
 */
app.get("/api/flywheel/records/high-quality", (req, res) => {
  try {
    const minScore = parseInt(req.query.min_score as string) || QUALITY_THRESHOLD;
    const records = flywheelLogger.getHighQualityRecords(minScore);
    res.json({ records, count: records.length, minScore });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * Export training data as JSONL
 * GET /api/flywheel/export
 */
app.get("/api/flywheel/export", async (req, res) => {
  try {
    const type = (req.query.type as "sft" | "dpo" | "all") || "all";
    const jsonl = await exportAsJSONL(type);

    res.setHeader("Content-Type", "application/jsonl");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-training-data.jsonl"`);
    res.send(jsonl);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MAINTENANCE ENDPOINTS
// ============================================================================

/**
 * Retry failed records from DLQ
 * POST /api/flywheel/dlq/retry
 */
app.post("/api/flywheel/dlq/retry", async (req, res) => {
  try {
    const result = await retryDLQ();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check
 * GET /api/flywheel/health
 */
app.get("/api/flywheel/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    errorMonitorRunning: isMonitorRunning(),
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`[Flywheel API] Running on http://localhost:${PORT}`);
  console.log(`[Flywheel API] Endpoints:`);
  console.log(`  POST /api/flywheel/log - Log an interaction`);
  console.log(`  POST /api/flywheel/evaluate - Add evaluation scores`);
  console.log(`  POST /api/flywheel/feedback - Add user feedback`);
  console.log(`  GET  /api/flywheel/stats - Get statistics`);
  console.log(`  GET  /api/flywheel/records - Get all records`);
  console.log(`  GET  /api/flywheel/export - Export training data`);
  console.log(`  POST /api/flywheel/dlq/retry - Retry failed records`);
  console.log(`  GET  /api/flywheel/health - Health check`);
});

export default app;
