// Parallel Search Tool
// Executes multiple search queries concurrently and deduplicates results

import { BaseTool } from "../base-tool";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "AIzaSyAItqaim6u_IqbbPbRUvLddZEAgZo9OU8E";
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID || "c793827e2e54f4511";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  query: string;
}

interface DeduplicatedSource {
  title: string;
  url: string;
  snippets: string[];
  queries: string[];
}

export class ParallelSearchTool extends BaseTool {
  name = "parallel_search";
  description = `Execute multiple search queries in parallel and return deduplicated results.
Use this for comprehensive research that requires multiple angles of investigation.
Provide an array of search queries - they will all run concurrently for speed.
Results are automatically deduplicated by URL.`;

  parameters = {
    queries: {
      type: "array",
      description: "Array of search queries to execute in parallel",
      items: { type: "string" },
    },
    results_per_query: {
      type: "integer",
      description: "Number of results per query (1-10, default 5)",
      optional: true,
    },
  };

  private async searchSingle(query: string, num: number): Promise<SearchResult[]> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${num}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error || !data.items) {
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.items.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || "",
        query,
      }));
    } catch {
      return [];
    }
  }

  private deduplicateResults(results: SearchResult[]): DeduplicatedSource[] {
    const urlMap = new Map<string, DeduplicatedSource>();

    for (const result of results) {
      const existing = urlMap.get(result.url);
      if (existing) {
        // Add snippet if not already present
        if (!existing.snippets.includes(result.snippet)) {
          existing.snippets.push(result.snippet);
        }
        // Track which queries found this source
        if (!existing.queries.includes(result.query)) {
          existing.queries.push(result.query);
        }
      } else {
        urlMap.set(result.url, {
          title: result.title,
          url: result.url,
          snippets: [result.snippet],
          queries: [result.query],
        });
      }
    }

    // Sort by number of queries that found this source (most relevant first)
    return Array.from(urlMap.values()).sort((a, b) => b.queries.length - a.queries.length);
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const queries = args.queries as string[];
    const num = Math.min(10, Math.max(1, (args.results_per_query as number) || 5));

    if (!queries || queries.length === 0) {
      return "Error: No queries provided";
    }

    // Execute all searches in parallel
    const searchPromises = queries.map(q => this.searchSingle(q, num));
    const allResults = await Promise.all(searchPromises);
    
    // Flatten and deduplicate
    const flatResults = allResults.flat();
    const deduplicated = this.deduplicateResults(flatResults);

    if (deduplicated.length === 0) {
      return `No results found for queries: ${queries.join(", ")}`;
    }

    // Format output
    const output: string[] = [
      `## Parallel Search Results`,
      `Searched ${queries.length} queries in parallel, found ${deduplicated.length} unique sources.`,
      ``,
      `### Queries Executed:`,
      ...queries.map((q, i) => `${i + 1}. "${q}"`),
      ``,
      `### Deduplicated Sources (sorted by relevance):`,
      ``,
    ];

    deduplicated.forEach((source, i) => {
      output.push(`**${i + 1}. ${source.title}**`);
      output.push(`   URL: ${source.url}`);
      output.push(`   Found by ${source.queries.length} queries: ${source.queries.map(q => `"${q}"`).join(", ")}`);
      output.push(`   Summary: ${source.snippets[0]}`);
      if (source.snippets.length > 1) {
        output.push(`   Additional context: ${source.snippets.slice(1).join(" | ")}`);
      }
      output.push(``);
    });

    output.push(`---`);
    output.push(`## Citation Block`);
    output.push(`Use these sources in your report:`);
    output.push(``);
    deduplicated.forEach((source, i) => {
      output.push(`[${i + 1}] ${source.title} - ${source.url}`);
    });

    return output.join("\n");
  }
}

// Helper function to format citations consistently
export function formatCitations(sources: DeduplicatedSource[]): string {
  return sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`).join("\n");
}

// Helper function to deduplicate citation strings
export function deduplicateCitations(citations: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  
  for (const citation of citations) {
    // Extract URL for deduplication
    const urlMatch = citation.match(/https?:\/\/[^\s]+/);
    const key = urlMatch ? urlMatch[0] : citation;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(citation);
    }
  }
  
  return unique;
}
