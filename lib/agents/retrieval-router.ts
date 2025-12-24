
import OpenAI from "openai";

export enum RetrievalSource {
  RAG = "rag",
  WEB = "web",
  HYBRID = "hybrid",
  MEMORY = "memory",
  NONE = "none"
}

export interface RetrievalPlan {
  source: RetrievalSource;
  queries: string[];
  reasoning: string;
}

// Keyword patterns for fast routing without LLM call
const FAST_ROUTE_PATTERNS: { pattern: RegExp; source: RetrievalSource }[] = [
  { pattern: /^(hi|hello|hey|thanks|thank you|bye|goodbye)\b/i, source: RetrievalSource.NONE },
  { pattern: /\b(what did (i|we|you) (say|mention|discuss)|earlier|before|previous)\b/i, source: RetrievalSource.MEMORY },
  { pattern: /\b(latest|current|today|news|2024|2025)\b/i, source: RetrievalSource.WEB },
  { pattern: /\b(our (project|code|app)|this (file|function|class)|local)\b/i, source: RetrievalSource.RAG },
];

export class RetrievalRouter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model: string = "nvidia/nemotron-3-nano-30b-a3b") {
    const key = apiKey || process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("API Key required for RetrievalRouter");
    
    this.client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: key,
    });
    this.model = model;
  }

  async route(query: string, context?: string): Promise<RetrievalPlan> {
    // Fast path: Check keyword patterns first to avoid LLM call
    for (const { pattern, source } of FAST_ROUTE_PATTERNS) {
      if (pattern.test(query)) {
        return { source, queries: [query], reasoning: "keyword_match" };
      }
    }
    
    // Short queries without specific keywords -> hybrid as safe default
    if (query.length < 20) {
      return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "short_query_default" };
    }

    const prompt = `
You are a retrieval strategist. Analyze the user's query and decide the best information source.

SOURCES:
- rag: Local knowledge base, documentation, internal facts. Use for specific project details.
- web: Internet search. Use for current events, external libraries, general knowledge.
- hybrid: Both. Use when the query needs internal context + external verification.
- memory: Conversation history. Use when asking about previous messages.
- none: No retrieval needed. Use for greetings, simple logic, or chit-chat.

QUERY: "${query}"
CONTEXT: ${context ? context.slice(0, 200) + "..." : "None"}

Respond in JSON:
{
  "source": "rag" | "web" | "hybrid" | "memory" | "none",
  "queries": ["query1", "query2"],
  "reasoning": "brief explanation"
}
`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 256,
      });

      const content = response.choices[0].message.content || "{}";
      
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "No JSON found" };
      }
      
      const plan = JSON.parse(jsonMatch[0]) as RetrievalPlan;
      
      // Fallback if parsing fails or returns invalid source
      if (!Object.values(RetrievalSource).includes(plan.source)) {
        return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "Fallback" };
      }

      return plan;
    } catch {
      // Silent fallback - don't log errors for routing
      return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "Error fallback" };
    }
  }
}
