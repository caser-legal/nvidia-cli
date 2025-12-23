// Google Search Tool
// Uses free Google Custom Search API

import { BaseTool } from "../base-tool";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "AIzaSyAItqaim6u_IqbbPbRUvLddZEAgZo9OU8E";
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID || "c793827e2e54f4511";

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

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const num = Math.min(10, Math.max(1, (args.num as number) || 5));

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${num}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        return `Google API Error: ${data.error.message}`;
      }

      if (!data.items || data.items.length === 0) {
        return `No results found for: ${query}`;
      }

      const results = data.items.map((item: any, i: number) => 
        `${i + 1}. ${item.title}\n   ${item.link}\n   ${item.snippet || ""}`
      ).join("\n\n");

      return `Search results for "${query}":\n\n${results}`;
    } catch (error) {
      return `Search error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
