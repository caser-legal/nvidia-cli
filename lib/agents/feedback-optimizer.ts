/**
 * Feedback Optimizer
 * Analyzes low-scoring interactions and generates improvement suggestions
 */

import OpenAI from "openai";
import { FlywheelLogger } from "./flywheel/logger";
import { FlywheelRecord, QUALITY_THRESHOLD } from "./flywheel/types";
import { NVIDIA_API_KEY } from "../api-key";
import { createLogger } from "../logger";

const log = createLogger("FeedbackOptimizer");

export interface OptimizationResult {
  improvedSystemPrompt?: string;
  suggestedExamples: string[];
  insights: string[];
  failurePatterns: FailurePattern[];
}

export interface FailurePattern {
  category: string;
  description: string;
  frequency: number;
  suggestedFix: string;
}

const ANALYSIS_PROMPT = `You are an AI system analyst. Analyze these failed agent interactions and identify patterns.

For each failure, consider:
1. What went wrong (tool errors, wrong approach, misunderstanding)
2. Why it failed (missing context, bad instructions, capability gap)
3. How to prevent it (better prompts, examples, guardrails)

Respond in JSON format:
{
  "patterns": [
    {
      "category": "tool_error|misunderstanding|capability_gap|context_missing|other",
      "description": "Brief description of the pattern",
      "frequency": <number of occurrences>,
      "suggestedFix": "Specific actionable fix"
    }
  ],
  "insights": ["Key insight 1", "Key insight 2"],
  "promptImprovements": ["Suggested system prompt change 1", "Change 2"]
}`;

export class FeedbackOptimizer {
  private client: OpenAI;
  private model: string;

  constructor(
    private flywheel: FlywheelLogger,
    apiKey?: string,
    model: string = "nvidia/nemotron-3-nano-30b-a3b"
  ) {
    const key = apiKey || NVIDIA_API_KEY;
    if (!key) throw new Error("API key required for FeedbackOptimizer");

    this.client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: key,
    });
    this.model = model;
  }

  /**
   * Get low-scoring interactions for analysis
   */
  async analyzeFailures(minScore: number = QUALITY_THRESHOLD): Promise<FlywheelRecord[]> {
    const records = this.flywheel.getRecords();
    return records.filter((r) => {
      // Check LLM-as-Judge score
      if (r.qualitySignals?.overallScore !== undefined) {
        return r.qualitySignals.overallScore < minScore;
      }
      // Check user rating (convert 1-5 to 0-10)
      if (r.qualitySignals?.userRating !== undefined) {
        return r.qualitySignals.userRating * 2 < minScore;
      }
      return false;
    });
  }

  /**
   * Get golden examples (high-quality records) for few-shot prompting
   */
  async getGoldenExamples(query: string, limit: number = 3): Promise<FlywheelRecord[]> {
    const highQuality = this.flywheel.getHighQualityRecords();

    // Simple keyword matching for relevance
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const scored = highQuality.map((record) => {
      const recordWords = new Set(record.userMessage.toLowerCase().split(/\s+/));
      let intersection = 0;
      for (const word of queryWords) {
        if (recordWords.has(word)) intersection++;
      }
      return { record, score: intersection };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.record);
  }

  /**
   * Generate optimization suggestions from failure analysis
   */
  async generateOptimizations(): Promise<OptimizationResult> {
    const failures = await this.analyzeFailures();

    if (failures.length === 0) {
      return {
        suggestedExamples: [],
        insights: ["No low-scoring interactions found."],
        failurePatterns: [],
      };
    }

    // Summarize failures for analysis
    const failureSummaries = failures.slice(0, 10).map((f) => ({
      userMessage: f.userMessage.slice(0, 200),
      response: f.assistantResponse.slice(0, 300),
      toolErrors: f.toolCalls
        .filter((t) => !t.success)
        .map((t) => ({
          tool: t.toolName,
          error: t.error?.slice(0, 100),
        })),
      score: f.qualitySignals?.overallScore ?? f.qualitySignals?.userRating,
      reasoning: f.qualitySignals?.reasoning?.slice(0, 200),
    }));

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          {
            role: "user",
            content: `Analyze these ${failures.length} failed interactions:\n\n${JSON.stringify(failureSummaries, null, 2)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      });

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return {
          suggestedExamples: [],
          insights: [`Found ${failures.length} low-scoring interactions but could not parse analysis.`],
          failurePatterns: [],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        patterns?: FailurePattern[];
        insights?: string[];
        promptImprovements?: string[];
      };

      return {
        improvedSystemPrompt: parsed.promptImprovements?.join("\n"),
        suggestedExamples: [],
        insights: parsed.insights || [`Analyzed ${failures.length} failures.`],
        failurePatterns: parsed.patterns || [],
      };
    } catch (error) {
      log.error("Analysis failed", { error: String(error) });
      return {
        suggestedExamples: [],
        insights: [
          `Found ${failures.length} low-scoring interactions. Analysis failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        failurePatterns: [],
      };
    }
  }

  /**
   * Get failure statistics
   */
  getFailureStats(): {
    totalFailures: number;
    byCategory: Record<string, number>;
    avgScore: number;
    commonTools: Record<string, number>;
  } {
    const failures = this.flywheel.getRecords().filter((r) => {
      if (r.qualitySignals?.overallScore !== undefined) {
        return r.qualitySignals.overallScore < QUALITY_THRESHOLD;
      }
      if (r.qualitySignals?.userRating !== undefined) {
        return r.qualitySignals.userRating * 2 < QUALITY_THRESHOLD;
      }
      return false;
    });

    const byCategory: Record<string, number> = {};
    const commonTools: Record<string, number> = {};
    let totalScore = 0;
    let scoreCount = 0;

    for (const f of failures) {
      // Categorize by workload type
      const category = f.workloadType || "unknown";
      byCategory[category] = (byCategory[category] || 0) + 1;

      // Track failed tools
      for (const tc of f.toolCalls.filter((t) => !t.success)) {
        commonTools[tc.toolName] = (commonTools[tc.toolName] || 0) + 1;
      }

      // Track scores
      const score = f.qualitySignals?.overallScore ?? (f.qualitySignals?.userRating ?? 0) * 2;
      if (score > 0) {
        totalScore += score;
        scoreCount++;
      }
    }

    return {
      totalFailures: failures.length,
      byCategory,
      avgScore: scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0,
      commonTools,
    };
  }
}
