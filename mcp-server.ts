#!/usr/bin/env npx tsx
/**
 * NVIDIA CLI MCP Server - Full Orchestration Version
 * Exposes all nvidia-cli tools + full Agent pipeline via MCP
 * 
 * NEW: dory_agent tool runs the complete orchestration pipeline
 * (unified context, RAG, flywheel, tool orchestrator, evaluator)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Import all tools
import { BashTool } from "./lib/agents/tools/bash.ts";
import { FileReadTool } from "./lib/agents/tools/file-read.ts";
import { FileWriteTool } from "./lib/agents/tools/file-write.ts";
import { ThinkTool } from "./lib/agents/tools/think.ts";
import { MemoryTool, EntityMemoryTool } from "./lib/agents/tools/memory.ts";
import { UnifiedMemoryTool } from "./lib/agents/tools/unified-memory.ts";
import { GoogleSearchTool } from "./lib/agents/tools/google-search.ts";
import { ParallelSearchTool } from "./lib/agents/tools/parallel-search.ts";
import { LocalDocsSearchTool } from "./lib/agents/tools/local-docs-search.ts";
import { SetProjectTool, GetProjectTool } from "./lib/agents/tools/project.ts";
import { 
  RAGIngestTool, RAGSearchTool, RAGQueryTool, RAGResearchTool, 
  RAGClearTool, RAGStatsTool, RAGValidateTool, RAGUpdateTool 
} from "./lib/agents/tools/rag-tools.ts";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./lib/agents/tools/code-documentation.ts";
import { MermaidGeneratorTool, QuickDiagramTool } from "./lib/agents/tools/mermaid-generator.ts";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./lib/agents/tools/github-analyzer.ts";
import { ReflectionTool, ExtendReportTool } from "./lib/agents/tools/reflection.ts";
import { ReportPlannerTool, SectionAuthorTool, ReportCompilerTool } from "./lib/agents/tools/report-planner.ts";
import { VisionAnalysisTool, iOSUIReviewTool, MockupComparisonTool } from "./lib/agents/tools/vision-analysis.ts";
import {
  SearchSpecialistTool, ReportWriterTool, QualityReviewerTool,
  ReportExtenderTool, SourceDeduplicatorTool,
  ReportPlannerTool as SpecialistReportPlannerTool,
  SectionAuthorTool as SpecialistSectionAuthorTool,
  ReportCompilerTool as SpecialistReportCompilerTool,
} from "./lib/agents/tools/specialist-agents.ts";

// Flywheel imports
import { getFlywheelLogger } from "./lib/agents/flywheel/logger.ts";
import { DatasetCreator } from "./lib/agents/flywheel/dataset-creator.ts";

// Agent runner for full orchestration
import { runDoryAgent } from "./lib/agents/mcp-agent-runner.ts";

const server = new McpServer({ name: "nvidia-cli", version: "2.0.0" });

const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY || "";

// Instantiate tools
const bashTool = new BashTool();
const fileReadTool = new FileReadTool();
const fileWriteTool = new FileWriteTool();
const thinkTool = new ThinkTool();
const memoryTool = new MemoryTool();
const entityMemoryTool = new EntityMemoryTool();
const unifiedMemoryTool = new UnifiedMemoryTool();
const googleSearchTool = new GoogleSearchTool();
const parallelSearchTool = new ParallelSearchTool();
const localDocsSearchTool = new LocalDocsSearchTool();
const setProjectTool = new SetProjectTool();
const getProjectTool = new GetProjectTool();
const codeDocTool = new CodeDocumentationTool(apiKey);
const docSpecialistTool = new DocumentationSpecialistTool(apiKey);
const mermaidTool = new MermaidGeneratorTool(apiKey);
const quickDiagramTool = new QuickDiagramTool();
const githubAnalyzerTool = new GitHubAnalyzerTool();
const githubFileReaderTool = new GitHubFileReaderTool();
const reflectionTool = new ReflectionTool(apiKey);
const extendReportTool = new ExtendReportTool(apiKey);
const reportPlannerTool = new ReportPlannerTool(apiKey);
const sectionAuthorTool = new SectionAuthorTool(apiKey);
const reportCompilerTool = new ReportCompilerTool();
const visionTool = new VisionAnalysisTool();
const iosUIReviewTool = new iOSUIReviewTool();
const mockupComparisonTool = new MockupComparisonTool();
const searchSpecialistTool = new SearchSpecialistTool(apiKey);
const reportWriterTool = new ReportWriterTool(apiKey);
const qualityReviewerTool = new QualityReviewerTool(apiKey);
const reportExtenderTool = new ReportExtenderTool(apiKey);
const sourceDeduplicatorTool = new SourceDeduplicatorTool();

const flywheelLogger = getFlywheelLogger({ enabled: true });

// ============================================================================
// DORY AGENT - FULL ORCHESTRATION PIPELINE (THE KEY NEW TOOL)
// ============================================================================

server.tool(
  "dory_agent",
  `Run the FULL Dory agent pipeline with complete orchestration.
This is the same pipeline as the Dory Web UI - includes:
- Unified Context (RAG + Memory retrieval before each call)
- Tool Orchestrator (smart tool selection)
- Feedback Optimizer (learns from past interactions)
- Auto-RAG Updater (syncs knowledge base)
- Flywheel Evaluator (auto-scores responses)
- Nudge System (ensures edits are made when requested)

Use this for complex tasks that need the full agent workflow.
For simple tool calls, use individual tools directly.`,
  {
    message: z.string().describe("The task or question for Dory to handle"),
    conversation_history: z.array(z.object({
      role: z.string(),
      content: z.string()
    })).optional().describe("Previous conversation messages for context")
  },
  async ({ message, conversation_history }) => {
    try {
      const result = await runDoryAgent(message, {
        apiKey,
        conversationHistory: conversation_history || []
      });
      
      const toolSummary = result.toolCalls.length > 0
        ? `\n\n---\nTools used: ${result.toolCalls.map(t => t.name).join(", ")}`
        : "";
      
      return { content: [{ type: "text", text: result.response + toolSummary }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Agent error: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// ============================================================================
// INDIVIDUAL TOOLS (for direct access when full orchestration not needed)
// ============================================================================

server.tool("bash", "Execute shell command", 
  { command: z.string(), timeout: z.number().optional() },
  async ({ command, timeout }) => ({ content: [{ type: "text", text: await bashTool.execute({ command, timeout }) }] })
);

server.tool("file_read", "Read files or list directory",
  { operation: z.enum(["read", "list"]), path: z.string(), max_lines: z.number().optional(), pattern: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await fileReadTool.execute(args) }] })
);

server.tool("file_write", "Write complete file content",
  { path: z.string(), content: z.string() },
  async (args) => ({ content: [{ type: "text", text: await fileWriteTool.execute(args) }] })
);

server.tool("think", "Think through a problem",
  { thought: z.string() },
  async ({ thought }) => ({ content: [{ type: "text", text: await thinkTool.execute({ thought }) }] })
);

server.tool("memory", "Store/retrieve from memory",
  { operation: z.enum(["remember", "recall", "list", "summarize", "promote", "clear"]), content: z.string().optional(), type: z.enum(["fact", "context", "decision", "entity", "task"]).optional(), storage: z.enum(["short", "long"]).optional() },
  async (args) => ({ content: [{ type: "text", text: await memoryTool.execute(args) }] })
);

server.tool("entity_memory", "Track named entities",
  { operation: z.enum(["add", "get", "list", "update"]), entity_name: z.string(), entity_type: z.enum(["person", "project", "company", "technology", "other"]).optional(), info: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await entityMemoryTool.execute(args) }] })
);

server.tool("unified_memory", "Unified memory interface",
  { operation: z.enum(["store", "recall", "context"]), content: z.string().optional(), type: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await unifiedMemoryTool.execute(args) }] })
);

server.tool("google_search", "Search Google",
  { query: z.string(), num: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: await googleSearchTool.execute(args) }] })
);

server.tool("parallel_search", "Multiple searches in parallel",
  { queries: z.array(z.string()), results_per_query: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: await parallelSearchTool.execute(args) }] })
);

server.tool("local_docs_search", "Search local documentation",
  { query: z.string(), directory: z.string().optional(), extensions: z.array(z.string()).optional() },
  async (args) => ({ content: [{ type: "text", text: await localDocsSearchTool.execute(args) }] })
);

server.tool("set_project", "Set working directory",
  { path: z.string() },
  async (args) => ({ content: [{ type: "text", text: await setProjectTool.execute(args) }] })
);

server.tool("get_project", "Get current project path", {},
  async () => ({ content: [{ type: "text", text: await getProjectTool.execute({}) }] })
);

// RAG Tools
server.tool("rag_ingest", "Ingest documents into RAG",
  { path: z.string().optional(), documents: z.array(z.object({ id: z.string(), content: z.string(), metadata: z.record(z.unknown()).optional() })).optional() },
  async (args) => ({ content: [{ type: "text", text: await RAGIngestTool.execute(args) }] })
);

server.tool("rag_search", "Search RAG knowledge base",
  { query: z.string(), top_k: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: await RAGSearchTool.execute(args) }] })
);

server.tool("rag_query", "Query RAG and generate answer",
  { query: z.string(), system_prompt: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await RAGQueryTool.execute(args) }] })
);

server.tool("rag_research", "Run research workflow",
  { topic: z.string(), max_iterations: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: await RAGResearchTool.execute(args) }] })
);

server.tool("rag_clear", "Clear RAG knowledge base", {},
  async () => ({ content: [{ type: "text", text: await RAGClearTool.execute({}) }] })
);

server.tool("rag_stats", "Get RAG statistics", {},
  async () => ({ content: [{ type: "text", text: await RAGStatsTool.execute({}) }] })
);

server.tool("rag_validate", "Validate RAG - remove stale docs", {},
  async () => ({ content: [{ type: "text", text: await RAGValidateTool.execute({}) }] })
);

server.tool("rag_update", "Update RAG from path",
  { path: z.string() },
  async (args) => ({ content: [{ type: "text", text: await RAGUpdateTool.execute(args) }] })
);

// Documentation Tools
server.tool("code_documentation", "Generate code documentation",
  { path: z.string(), format: z.enum(["markdown", "jsdoc", "inline"]).optional(), include_examples: z.boolean().optional() },
  async (args) => ({ content: [{ type: "text", text: await codeDocTool.execute(args) }] })
);

server.tool("documentation_specialist", "Advanced documentation generation",
  { path: z.string(), type: z.enum(["readme", "api", "architecture", "guide"]) },
  async (args) => ({ content: [{ type: "text", text: await docSpecialistTool.execute(args) }] })
);

// Diagram Tools
server.tool("mermaid_generator", "Generate Mermaid diagrams",
  { input: z.string(), diagram_type: z.enum(["flowchart", "sequence", "class", "state", "er"]) },
  async (args) => ({ content: [{ type: "text", text: await mermaidTool.execute(args) }] })
);

server.tool("quick_diagram", "Quick diagram from description",
  { description: z.string() },
  async (args) => ({ content: [{ type: "text", text: await quickDiagramTool.execute(args) }] })
);

// GitHub Tools
server.tool("github_analyzer", "Analyze GitHub repository",
  { repo_url: z.string(), analysis_type: z.enum(["structure", "readme", "issues", "prs", "full"]).optional() },
  async (args) => ({ content: [{ type: "text", text: await githubAnalyzerTool.execute(args) }] })
);

server.tool("github_file_reader", "Read file from GitHub repo",
  { repo_url: z.string(), file_path: z.string() },
  async (args) => ({ content: [{ type: "text", text: await githubFileReaderTool.execute(args) }] })
);

// Reflection Tools
server.tool("reflection", "Reflect on content to improve quality",
  { content: z.string(), context: z.string().optional(), criteria: z.array(z.string()).optional() },
  async (args) => ({ content: [{ type: "text", text: await reflectionTool.execute(args) }] })
);

server.tool("extend_report", "Extend a report section",
  { section: z.string(), direction: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await extendReportTool.execute(args) }] })
);

// Report Tools
server.tool("report_planner", "Plan report structure",
  { topic: z.string(), audience: z.string().optional(), depth: z.enum(["brief", "standard", "comprehensive"]).optional() },
  async (args) => ({ content: [{ type: "text", text: await reportPlannerTool.execute(args) }] })
);

server.tool("section_author", "Write a report section",
  { section: z.string(), plan: z.string(), sources: z.array(z.string()).optional() },
  async (args) => ({ content: [{ type: "text", text: await sectionAuthorTool.execute(args) }] })
);

server.tool("report_compiler", "Compile report from sections",
  { sections: z.array(z.string()), format: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await reportCompilerTool.execute(args) }] })
);

// Vision Tools
server.tool("vision_analyze", "Analyze images with NVIDIA VLM",
  { image_paths: z.array(z.string()), query: z.string(), enable_reasoning: z.boolean().optional() },
  async (args) => ({ content: [{ type: "text", text: await visionTool.execute(args) }] })
);

server.tool("ios_ui_review", "Review iOS screenshots for UI issues",
  { screenshot_paths: z.array(z.string()), focus: z.string().optional(), compare_to_mockup: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await iosUIReviewTool.execute(args) }] })
);

server.tool("compare_mockup", "Compare mockup to implementation",
  { mockup_path: z.string(), implementation_path: z.string(), strict_mode: z.boolean().optional() },
  async (args) => ({ content: [{ type: "text", text: await mockupComparisonTool.execute(args) }] })
);

// Specialist Agent Tools
server.tool("search_specialist", "Deep multi-source research",
  { research_topic: z.string(), search_depth: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await searchSpecialistTool.execute(args) }] })
);

server.tool("report_writer", "Create full report from research",
  { research_findings: z.string(), report_title: z.string(), report_style: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: await reportWriterTool.execute(args) }] })
);

server.tool("quality_reviewer", "Evaluate report quality",
  { original_question: z.string(), report: z.string() },
  async (args) => ({ content: [{ type: "text", text: await qualityReviewerTool.execute(args) }] })
);

server.tool("report_extender", "Extend report with new findings",
  { existing_report: z.string(), new_findings: z.string(), gaps_to_fill: z.string() },
  async (args) => ({ content: [{ type: "text", text: await reportExtenderTool.execute(args) }] })
);

server.tool("deduplicate_sources", "Clean up source citations",
  { sources: z.string() },
  async (args) => ({ content: [{ type: "text", text: await sourceDeduplicatorTool.execute(args) }] })
);

// Flywheel Tools
server.tool("flywheel_log", "Log interaction for continuous improvement",
  { user_message: z.string(), assistant_response: z.string(), tool_calls: z.array(z.object({ toolName: z.string(), arguments: z.record(z.unknown()), result: z.string(), durationMs: z.number(), success: z.boolean() })).optional(), model: z.string().optional(), mode: z.string().optional() },
  async ({ user_message, assistant_response, tool_calls, model, mode }) => {
    const record = await flywheelLogger.logInteraction({ userMessage: user_message, assistantResponse: assistant_response, systemPrompt: "", conversationHistory: [], toolCalls: tool_calls || [], model: model || "nvidia/nemotron-3-nano-30b-a3b", mode: mode || "agent", tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 0 });
    return { content: [{ type: "text", text: record ? `Logged: ${record.id}` : "Logging disabled" }] };
  }
);

server.tool("flywheel_stats", "Get flywheel statistics", {},
  async () => {
    try {
      const { getFlywheelStats } = await import("./lib/agents/flywheel/elasticsearch-query.ts");
      return { content: [{ type: "text", text: JSON.stringify(await getFlywheelStats(), null, 2) }] };
    } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
  }
);

server.tool("flywheel_export", "Export flywheel data for training",
  { include_tool_calls: z.boolean().optional() },
  async () => {
    try {
      const { exportFlywheelData } = await import("./lib/agents/flywheel/elasticsearch-query.ts");
      const data = await exportFlywheelData();
      return { content: [{ type: "text", text: `Exported ${data.length} records` }] };
    } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
  }
);

server.tool("flywheel_create_dataset", "Create training datasets",
  { workload_id: z.string() },
  async ({ workload_id }) => {
    const creator = new DatasetCreator(flywheelLogger);
    const datasets = creator.createDatasets(workload_id);
    if (!datasets) return { content: [{ type: "text", text: "Not enough records (min 10)" }] };
    return { content: [{ type: "text", text: `Train: ${datasets.train.numRecords}, Eval: ${datasets.eval.numRecords}, Test: ${datasets.test.numRecords}` }] };
  }
);

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[nvidia-cli MCP v2.0] Server started with full orchestration");
}

main().catch((error) => {
  console.error("[nvidia-cli MCP] Fatal error:", error);
  process.exit(1);
});
