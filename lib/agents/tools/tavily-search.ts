// Tavily Search Tool
// Purpose-built search API for AI agents with topic-aware search and content extraction

import { BaseTool } from "../base-tool";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "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";
const TAVILY_API_URL = "https://api.tavily.com/search";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  query: string;
}

export class TavilySearchTool extends BaseTool {
  name = "tavily_search";
  description = `Search the web using Tavily API - purpose-built for AI agents.
Better than Google for deep research with full content extraction.
Supports topic-aware search (general, news, finance) and date filtering.
Use this for comprehensive research that needs full article content.`;

  parameters = {
    query: {
      type: "string",
      description: "The search query",
    },
    topic: {
      type: "string",
      description: "Search topic: 'general', 'news', or 'finance'. Default: 'general'",
      optional: true,
    },
    days: {
      type: "integer",
      description: "Only return results from the last N days. Default: no limit",
      optional: true,
    },
    max_results: {
      type: "integer",
      description: "Maximum number of results (1-10, default 5)",
      optional: true,
    },
    include_raw_content: {
      type: "boolean",
      description: "Include full raw content from pages. Default: false",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const topic = (args.topic as string) || "general";
    const days = args.days as number | undefined;
    const maxResults = Math.min(10, Math.max(1, (args.max_results as number) || 5));
    const includeRawContent = (args.include_raw_content as boolean) || false;

    try {
      const response = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          topic,
          days,
          max_results: maxResults,
          include_raw_content: includeRawContent,
          search_depth: "advanced",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return `Tavily API error: ${response.status} - ${error}`;
      }

      const data = (await response.json()) as TavilyResponse;

      if (!data.results || data.results.length === 0) {
        return `No results found for: "${query}"`;
      }

      // Format results
      const output: string[] = [
        `## Tavily Search Results for "${query}"`,
        `Topic: ${topic} | Results: ${data.results.length}`,
        ``,
      ];

      data.results.forEach((result, i) => {
        output.push(`### ${i + 1}. ${result.title}`);
        output.push(`**URL:** ${result.url}`);
        output.push(`**Relevance:** ${(result.score * 100).toFixed(1)}%`);
        output.push(``);
        output.push(result.content);
        if (includeRawContent && result.raw_content) {
          output.push(``);
          output.push(`**Full Content:**`);
          output.push(result.raw_content.slice(0, 2000) + (result.raw_content.length > 2000 ? "..." : ""));
        }
        output.push(``);
        output.push(`---`);
        output.push(``);
      });

      // Add citation block
      output.push(`## Sources`);
      data.results.forEach((result, i) => {
        output.push(`[${i + 1}] ${result.title} - ${result.url}`);
      });

      return output.join("\n");
    } catch (error) {
      return `Tavily search error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Parallel Tavily search - multiple queries at once
export class ParallelTavilySearchTool extends BaseTool {
  name = "parallel_tavily_search";
  description = `Execute multiple Tavily searches in parallel.
Use this for comprehensive research covering multiple angles of a topic.
All queries run concurrently for speed, results are deduplicated by URL.`;

  parameters = {
    queries: {
      type: "array",
      description: "Array of search queries to execute in parallel",
      items: { type: "string" },
    },
    topic: {
      type: "string",
      description: "Search topic for all queries: 'general', 'news', or 'finance'",
      optional: true,
    },
    days: {
      type: "integer",
      description: "Only return results from the last N days",
      optional: true,
    },
  };

  private async searchSingle(
    query: string,
    topic: string,
    days?: number
  ): Promise<{ query: string; results: TavilyResult[] }> {
    try {
      const response = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          topic,
          days,
          max_results: 5,
          search_depth: "advanced",
        }),
      });

      if (!response.ok) return { query, results: [] };

      const data = (await response.json()) as TavilyResponse;
      return { query, results: data.results || [] };
    } catch {
      return { query, results: [] };
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const queries = args.queries as string[];
    const topic = (args.topic as string) || "general";
    const days = args.days as number | undefined;

    if (!queries || queries.length === 0) {
      return "Error: No queries provided";
    }

    // Execute all searches in parallel
    const searchPromises = queries.map((q) => this.searchSingle(q, topic, days));
    const allResults = await Promise.all(searchPromises);

    // Deduplicate by URL
    const urlMap = new Map<string, { result: TavilyResult; queries: string[] }>();
    
    for (const { query, results } of allResults) {
      for (const result of results) {
        const existing = urlMap.get(result.url);
        if (existing) {
          if (!existing.queries.includes(query)) {
            existing.queries.push(query);
          }
          // Keep higher score
          if (result.score > existing.result.score) {
            existing.result = result;
          }
        } else {
          urlMap.set(result.url, { result, queries: [query] });
        }
      }
    }

    // Sort by number of queries that found it (relevance)
    const deduplicated = Array.from(urlMap.values()).sort(
      (a, b) => b.queries.length - a.queries.length || b.result.score - a.result.score
    );

    if (deduplicated.length === 0) {
      return `No results found for queries: ${queries.join(", ")}`;
    }

    // Format output
    const output: string[] = [
      `## Parallel Tavily Search Results`,
      `Executed ${queries.length} queries, found ${deduplicated.length} unique sources`,
      ``,
      `### Queries:`,
      ...queries.map((q, i) => `${i + 1}. "${q}"`),
      ``,
      `### Results (sorted by relevance):`,
      ``,
    ];

    deduplicated.forEach((item, i) => {
      output.push(`**${i + 1}. ${item.result.title}**`);
      output.push(`URL: ${item.result.url}`);
      output.push(`Found by ${item.queries.length} queries: ${item.queries.map((q) => `"${q}"`).join(", ")}`);
      output.push(`Score: ${(item.result.score * 100).toFixed(1)}%`);
      output.push(``);
      output.push(item.result.content);
      output.push(``);
      output.push(`---`);
      output.push(``);
    });

    // Citation block
    output.push(`## Sources`);
    deduplicated.forEach((item, i) => {
      output.push(`[${i + 1}] ${item.result.title} - ${item.result.url}`);
    });

    return output.join("\n");
  }
}
