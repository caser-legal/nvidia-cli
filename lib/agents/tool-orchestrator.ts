
import OpenAI from "openai";
import { Tool } from "./types";
import { FlywheelLogger } from "./flywheel";

export class ToolOrchestrator {
  private client: OpenAI;
  private model: string;
  private tools: Map<string, Tool>;
  private flywheel?: FlywheelLogger;

  constructor(
    tools: Tool[], 
    apiKey?: string, 
    model: string = "nvidia/nemotron-3-nano-30b-a3b",
    flywheel?: FlywheelLogger
  ) {
    const key = apiKey || process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("API Key required for ToolOrchestrator");

    this.client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: key,
    });
    this.model = model;
    this.tools = new Map(tools.map(t => [t.name, t]));
    this.flywheel = flywheel;
  }

  async selectTools(task: string, context?: string): Promise<string[]> {
    const toolDefs = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description
    }));

    // If flywheel exists, check for historical tool usage for similar tasks
    let historicalHint = "";
    if (this.flywheel) {
      // Logic to fetch historical successful tool chains would go here
      // For now, we simulate it
    }

    const prompt = `
You are a master tool orchestrator. Select the best tools to accomplish the task.

AVAILABLE TOOLS:
${toolDefs.map(t => `- ${t.name}: ${t.description.split('\n')[0]}`).join('\n')}

TASK: "${task}"
CONTEXT: ${context ? context.slice(0, 200) + "..." : "None"}

Return a JSON array of tool names to use, in order of execution priority.
Example: ["google_search", "file_write"]
`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 128,
        response_format: { type: "json_object" } // Assuming model supports it, or parse manually
      });

      const content = response.choices[0].message.content || "[]";
      // Handle potential non-JSON output if model is weak
      try {
        const selected = JSON.parse(content);
        if (Array.isArray(selected)) {
          // Validate tools exist
          return selected.filter(name => this.tools.has(name));
        }
        // If it returned { "tools": [...] }
        if (selected.tools && Array.isArray(selected.tools)) {
           return selected.tools.filter((name: string) => this.tools.has(name));
        }
      } catch {
        // Fallback: regex search for tool names in response
        return toolDefs.map(t => t.name).filter(name => content.includes(name));
      }

      return [];
    } catch (error) {
      console.error("ToolOrchestrator error:", error);
      return [];
    }
  }
}
