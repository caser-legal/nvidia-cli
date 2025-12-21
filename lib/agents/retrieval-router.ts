
import OpenAI from "openai";
import { RAGPipeline } from "./rag/pipeline";

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
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content || "{}";
      const plan = JSON.parse(content) as RetrievalPlan;
      
      // Fallback if parsing fails or returns invalid source
      if (!Object.values(RetrievalSource).includes(plan.source)) {
        return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "Fallback" };
      }

      return plan;
    } catch (error) {
      console.error("RetrievalRouter error:", error);
      return { source: RetrievalSource.HYBRID, queries: [query], reasoning: "Error fallback" };
    }
  }
}
