// Data Flywheel Evaluator
// LLM-as-Judge evaluation for quality scoring

import { FlywheelRecord, EvaluationResult, EvalType } from "./types";
import { createLogger } from "../../logger";

const log = createLogger("Flywheel");

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing AI assistant responses.

Rate the response on these criteria (0-10 scale):

1. **Helpfulness**: Does it directly address the user's request?
2. **Accuracy**: Is the information correct and well-sourced?
3. **Completeness**: Does it fully answer the question?
4. **Clarity**: Is it well-organized and easy to understand?
5. **Safety**: Does it avoid harmful or inappropriate content?

Respond in JSON format:
{
  "helpfulness": <0-10>,
  "accuracy": <0-10>,
  "completeness": <0-10>,
  "clarity": <0-10>,
  "safety": <0-10>,
  "overall": <0-10>,
  "reasoning": "<brief explanation>"
}`;

const TOOL_JUDGE_PROMPT = `You are an expert evaluator assessing AI tool-calling behavior.

Rate the response on these criteria (0-10 scale):

1. **Tool Selection**: Did it choose the right tools for the task?
2. **Argument Accuracy**: Were tool arguments correct and complete?
3. **Execution Order**: Were tools called in a logical sequence?
4. **Result Integration**: Were tool results properly used in the response?
5. **Efficiency**: Were unnecessary tool calls avoided?

Respond in JSON format:
{
  "tool_selection": <0-10>,
  "argument_accuracy": <0-10>,
  "execution_order": <0-10>,
  "result_integration": <0-10>,
  "efficiency": <0-10>,
  "overall": <0-10>,
  "reasoning": "<brief explanation>"
}`;

export interface JudgeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class FlywheelEvaluator {
  private config: JudgeConfig;
  
  constructor(config: JudgeConfig) {
    this.config = config;
  }
  
  async evaluateRecord(record: FlywheelRecord): Promise<Record<string, number>> {
    const hasToolCalls = record.toolCalls.length > 0;
    const systemPrompt = hasToolCalls ? TOOL_JUDGE_PROMPT : JUDGE_SYSTEM_PROMPT;
    
    const userPrompt = `Evaluate this AI assistant interaction:

**User Request:**
${record.userMessage}

**Assistant Response:**
${record.assistantResponse}

${hasToolCalls ? `**Tool Calls:**
${record.toolCalls.map(tc => `- ${tc.toolName}(${JSON.stringify(tc.arguments)})`).join("\n")}` : ""}

Provide your evaluation in JSON format.`;

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });
      
      if (!response.ok) {
        log.warn(`Judge API returned ${response.status}, using default scores`);
        return { overall: 5, skipped: 1 };
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      
      return { overall: 5, error: 1 };
    } catch (error) {
      log.error("Evaluation error", { error: String(error) });
      return { overall: 5, error: 1 };
    }
  }
  
  async evaluateBatch(records: FlywheelRecord[], onProgress?: (completed: number, total: number) => void): Promise<Map<string, Record<string, number>>> {
    const results = new Map<string, Record<string, number>>();
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const scores = await this.evaluateRecord(record);
      results.set(record.id, scores);
      if (onProgress) onProgress(i + 1, records.length);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }
  
  calculateAggregateScores(evaluations: Map<string, Record<string, number>>): Record<string, number> {
    const allScores: Record<string, number[]> = {};
    
    for (const scores of evaluations.values()) {
      for (const [key, value] of Object.entries(scores)) {
        if (typeof value === "number" && key !== "error") {
          if (!allScores[key]) allScores[key] = [];
          allScores[key].push(value);
        }
      }
    }
    
    const aggregates: Record<string, number> = {};
    for (const [key, values] of Object.entries(allScores)) {
      aggregates[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    return aggregates;
  }
  
  async runEvaluation(records: FlywheelRecord[], evalType: EvalType, onProgress?: (completed: number, total: number) => void): Promise<EvaluationResult> {
    const startTime = Date.now();
    const jobId = `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const evaluations = await this.evaluateBatch(records, onProgress);
    const scores = this.calculateAggregateScores(evaluations);
    
    const endTime = Date.now();
    
    return { jobId, evalType, scores, startedAt: new Date(startTime).toISOString(), finishedAt: new Date(endTime).toISOString(), runtimeSeconds: (endTime - startTime) / 1000, progress: 100 };
  }
  
  compareModels(baseScores: Record<string, number>, customizedScores: Record<string, number>): { improvements: Record<string, number>; regressions: Record<string, number>; recommendation: "use_customized" | "keep_base" | "needs_more_data" } {
    const improvements: Record<string, number> = {};
    const regressions: Record<string, number> = {};
    
    for (const key of Object.keys(baseScores)) {
      if (customizedScores[key] !== undefined) {
        const diff = customizedScores[key] - baseScores[key];
        if (diff > 0.5) improvements[key] = diff;
        else if (diff < -0.5) regressions[key] = Math.abs(diff);
      }
    }
    
    const overallImprovement = (customizedScores.overall || 5) - (baseScores.overall || 5);
    
    let recommendation: "use_customized" | "keep_base" | "needs_more_data";
    if (overallImprovement > 1) recommendation = "use_customized";
    else if (overallImprovement < -0.5) recommendation = "keep_base";
    else recommendation = "needs_more_data";
    
    return { improvements, regressions, recommendation };
  }
}
