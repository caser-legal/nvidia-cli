// Google Search Tool
// Uses free Google Custom Search API

import { BaseTool, z } from "../base-tool";
import { GOOGLE_API_KEY, GOOGLE_CSE_ID } from "../../api-key";

const schema = z.object({
  query: z.string().min(1, "query is required"),
  num: z.number().int().min(1).max(10).optional(),
});

export class GoogleSearchTool extends BaseTool {
  name = "google_search";
  description = `Search Google using the Custom Search API. FREE and fast.
Returns titles, URLs, and snippets for search results.
Use this for fact-checking, research, and finding information.`;

  parameters = {
    query: {
      type: "string",
      description: "The search query",
    },
    num: {
      type: "integer",
      description: "Number of results (1-10, default 5)",
      optional: true,
    },
  };
  
  protected schema = schema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    
    const { query, num = 5 } = v.data as { query: string; num?: number };

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=${num}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) return `Google API Error: ${data.error.message}`;
      if (!data.items || data.items.length === 0) return `No results found for: ${query}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = data.items.map((item: any, i: number) => 
        `${i + 1}. ${item.title}\n   ${item.link}\n   ${item.snippet || ""}`
      ).join("\n\n");

      return `Search results for "${query}":\n\n${results}`;
    } catch (error) {
      return `Search error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
