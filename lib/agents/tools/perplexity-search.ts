// Perplexity Search Tools - sonar and sonar-pro only
import { BaseTool, z } from "../base-tool";
import { PERPLEXITY_API_KEY } from "../../api-key";
import { execFileSync } from "child_process";

interface PerplexityResponse {
  choices: Array<{ message: { content: string } }>;
  citations?: string[];
}

function buildFallbackQuery(query: string): string {
  const stopWords = new Set([
    "a", "an", "and", "app", "apps", "the", "to", "for", "of", "in", "on", "with", "by",
    "make", "look", "tips", "design", "polished", "refined",
  ]);
  const tokens = query
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const filtered = tokens.filter((token) => !stopWords.has(token.toLowerCase()));
  return filtered.slice(0, 10).join(" ");
}

async function callPerplexity(model: string, query: string, systemPrompt?: string): Promise<{ content: string; citations: string[] }> {
  const normalizedQuery = query.replace(/\bapp\b/gi, "application");
  const fallbackQuery = buildFallbackQuery(normalizedQuery);
  const queries = fallbackQuery && fallbackQuery !== normalizedQuery
    ? [normalizedQuery, fallbackQuery]
    : [normalizedQuery];
  const maxAttempts = 3;
  let lastError: unknown;

  for (const currentQuery of queries) {
    const messages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, { role: "user", content: currentQuery }]
      : [{ role: "user", content: currentQuery }];
    const payload = JSON.stringify({ model, messages });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = execFileSync(
          "curl",
          [
            "--http1.1",
            "-s",
            "-X",
            "POST",
            "https://api.perplexity.ai/chat/completions",
            "-H",
            `Authorization: Bearer ${PERPLEXITY_API_KEY}`,
            "-H",
            "Content-Type: application/json",
            "-d",
            payload,
          ],
          { timeout: 60000, encoding: "utf-8" }
        );

        const trimmed = result.trim();
        if (!trimmed) {
          throw new Error("Empty response from Perplexity");
        }

        const data = JSON.parse(trimmed) as PerplexityResponse;
        return {
          content: data.choices[0]?.message?.content || "No response",
          citations: data.citations || [],
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const searchSchema = z.object({
  query: z.string().min(1, "query is required"),
});

export class PerplexitySearchTool extends BaseTool {
  name = "perplexity_search";
  description = "Search the web using Perplexity AI (sonar). Returns AI-synthesized answers with citations.";
  parameters = { query: { type: "string", description: "The search query" } };
  protected schema = searchSchema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    const { query } = v.data as { query: string };

    try {
      const { content, citations } = await callPerplexity("sonar", query);
      let result = `## Search: "${query}"\n\n${content}`;
      if (citations.length > 0) {
        result += `\n\n### Sources:\n${citations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}`;
      }
      return result;
    } catch (error) {
      return `Search error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

const askSchema = z.object({
  question: z.string().min(1, "question is required"),
});

export class PerplexityAskTool extends BaseTool {
  name = "perplexity_ask";
  description = "Ask Perplexity with real-time web search (sonar-pro). Best for detailed questions.";
  parameters = { question: { type: "string", description: "The question to ask" } };
  protected schema = askSchema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    const { question } = v.data as { question: string };

    try {
      const { content, citations } = await callPerplexity("sonar-pro", question);
      let result = `## Answer\n\n${content}`;
      if (citations.length > 0) {
        result += `\n\n### Sources:\n${citations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}`;
      }
      return result;
    } catch (error) {
      return `Ask error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

const researchSchema = z.object({
  topic: z.string().min(1, "topic is required"),
});

export class PerplexityResearchTool extends BaseTool {
  name = "perplexity_research";
  description = "Research a topic with Perplexity (sonar-pro). Returns a sourced summary.";
  parameters = { topic: { type: "string", description: "The topic to research" } };
  protected schema = researchSchema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    const { topic } = v.data as { topic: string };

    try {
      const systemPrompt = "Provide a concise research brief with key findings and citations.";
      const { content, citations } = await callPerplexity("sonar-pro", topic, systemPrompt);
      let result = `## Research: "${topic}"\n\n${content}`;
      if (citations.length > 0) {
        result += `\n\n### Sources:\n${citations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}`;
      }
      return result;
    } catch (error) {
      return `Research error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

const reasonSchema = z.object({
  problem: z.string().min(1, "problem is required"),
});

export class PerplexityReasonTool extends BaseTool {
  name = "perplexity_reason";
  description = "Reason through a problem with Perplexity (sonar-pro).";
  parameters = { problem: { type: "string", description: "The problem to reason through" } };
  protected schema = reasonSchema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    const { problem } = v.data as { problem: string };

    try {
      const systemPrompt = "Reason carefully, show steps briefly, and cite sources where applicable.";
      const { content, citations } = await callPerplexity("sonar-pro", problem, systemPrompt);
      let result = `## Reasoning\n\n${content}`;
      if (citations.length > 0) {
        result += `\n\n### Sources:\n${citations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}`;
      }
      return result;
    } catch (error) {
      return `Reason error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export { callPerplexity };
