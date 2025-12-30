import OpenAI from "openai";
import { NVIDIA_API_KEY } from "../api-key";
import { Tool } from "./types";
import { FlywheelLogger } from "./flywheel";
import { createLogger } from "../logger";

const log = createLogger("ToolOrchestrator");

export class ToolOrchestrator {
  private client: OpenAI;
  private model: string;
  private tools: Map<string, Tool>;
  private flywheel?: FlywheelLogger;

  constructor(tools: Tool[], apiKey?: string, model: string = "nvidia/nemotron-3-nano-30b-a3b", flywheel?: FlywheelLogger) {
    const key = apiKey || NVIDIA_API_KEY;
    if (!key) throw new Error("API Key required for ToolOrchestrator");

    this.client = new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: key });
    this.model = model;
    this.tools = new Map(tools.map(t => [t.name, t]));
    this.flywheel = flywheel;
  }

  /**
   * Select the most relevant tools for a given task
   * Returns tool names that should be made available to the LLM
   */
  async selectTools(task: string, context?: string): Promise<string[]> {
    // Fast path: Always include core tools
    const coreTools = ["file_read", "file_write", "bash", "think", "set_project", "get_project"];
    
    // Keyword-based fast selection (no LLM call needed)
    const taskLower = task.toLowerCase();
    const selected = new Set(coreTools);
    
    // Memory tools
    if (taskLower.includes("remember") || taskLower.includes("recall") || taskLower.includes("memory") || taskLower.includes("entity")) {
      selected.add("memory");
      selected.add("entity_memory");
      selected.add("unified_memory");
    }
    
    // Search tools
    if (taskLower.includes("search") || taskLower.includes("find") || taskLower.includes("look up") || taskLower.includes("research")) {
      selected.add("google_search");
      selected.add("parallel_search");
      selected.add("local_docs_search");
      selected.add("rag_search");
      selected.add("rag_query");
    }
    
    // RAG tools
    if (taskLower.includes("rag") || taskLower.includes("ingest") || taskLower.includes("index") || taskLower.includes("knowledge")) {
      selected.add("rag_ingest");
      selected.add("rag_search");
      selected.add("rag_query");
      selected.add("rag_research");
      selected.add("rag_stats");
    }
    
    // Vision tools
    if (taskLower.includes("image") || taskLower.includes("screenshot") || taskLower.includes("ui") || taskLower.includes("mockup") || taskLower.includes("visual")) {
      selected.add("vision_analyze");
      selected.add("ios_ui_review");
      selected.add("compare_mockup");
    }
    
    // iOS/build tools
    if (taskLower.includes("ios") || taskLower.includes("swift") || taskLower.includes("xcode") || taskLower.includes("build") || taskLower.includes("install")) {
      selected.add("bash");
      selected.add("ios_ui_review");
    }
    
    // Documentation tools
    if (taskLower.includes("document") || taskLower.includes("readme") || taskLower.includes("api doc")) {
      selected.add("code_documentation");
      selected.add("documentation_specialist");
    }
    
    // Diagram tools
    if (taskLower.includes("diagram") || taskLower.includes("mermaid") || taskLower.includes("flowchart") || taskLower.includes("architecture")) {
      selected.add("mermaid_generator");
      selected.add("quick_diagram");
    }
    
    // Report tools
    if (taskLower.includes("report") || taskLower.includes("analysis") || taskLower.includes("audit")) {
      selected.add("report_planner");
      selected.add("section_author");
      selected.add("report_writer");
      selected.add("report_compiler");
      selected.add("quality_reviewer");
      selected.add("reflection");
    }
    
    // GitHub tools
    if (taskLower.includes("github") || taskLower.includes("repo") || taskLower.includes("repository")) {
      selected.add("github_analyzer");
      selected.add("github_file_reader");
    }
    
    // Specialist tools for complex tasks
    if (taskLower.includes("deep") || taskLower.includes("comprehensive") || taskLower.includes("thorough")) {
      selected.add("search_specialist");
      selected.add("rag_research");
    }
    
    // If task is short/simple, just return core tools
    if (task.length < 50 && selected.size === coreTools.length) {
      return Array.from(selected);
    }
    
    // For complex tasks, use LLM to refine selection
    if (task.length > 100 || context) {
      try {
        const llmSelected = await this.llmSelectTools(task, context);
        for (const tool of llmSelected) {
          if (this.tools.has(tool)) {
            selected.add(tool);
          }
        }
      } catch (e) {
        log.debug("LLM tool selection failed, using keyword selection", { error: String(e) });
      }
    }
    
    const result = Array.from(selected).filter(name => this.tools.has(name));
    log.debug("Tool selection complete", { task: task.slice(0, 50), selected: result.length, total: this.tools.size });
    
    return result;
  }

  private async llmSelectTools(task: string, context?: string): Promise<string[]> {
    const toolDefs = Array.from(this.tools.values()).map(t => ({ name: t.name, description: t.description.split('\n')[0] }));

    const prompt = `Select the best tools to accomplish the task. Return ONLY a JSON array of tool names.

AVAILABLE TOOLS:
${toolDefs.map(t => `- ${t.name}: ${t.description}`).join('\n')}

TASK: "${task.slice(0, 300)}"
CONTEXT: ${context ? context.slice(0, 200) : "None"}

Return JSON array like: ["tool1", "tool2"]`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 256,
      });

      const content = response.choices[0].message.content || "[]";
      
      // Extract JSON array from response
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter(name => typeof name === "string" && this.tools.has(name));
        }
      }
      
      return [];
    } catch (error) {
      log.debug("LLM tool selection error", { error: String(error) });
      return [];
    }
  }

  /**
   * Get all available tool names
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
