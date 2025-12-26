#!/usr/bin/env npx tsx
/**
 * NVIDIA CLI MCP Server
 * Exposes all nvidia-cli tools via Model Context Protocol for Codex CLI integration
 * 
 * Usage in ~/.codex/config.toml:
 * [mcp_servers.nvidia-cli]
 * command = "npx"
 * args = ["tsx", "/Users/home/Documents/nvidia-cli/mcp-server.ts"]
 * cwd = "/Users/home/Documents/nvidia-cli"
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
  RAGIngestTool, 
  RAGSearchTool, 
  RAGQueryTool, 
  RAGResearchTool, 
  RAGClearTool, 
  RAGStatsTool,
  RAGValidateTool,
  RAGUpdateTool 
} from "./lib/agents/tools/rag-tools.ts";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./lib/agents/tools/code-documentation.ts";
import { MermaidGeneratorTool, QuickDiagramTool } from "./lib/agents/tools/mermaid-generator.ts";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./lib/agents/tools/github-analyzer.ts";
import { ReflectionTool, ExtendReportTool } from "./lib/agents/tools/reflection.ts";
import { ReportPlannerTool, SectionAuthorTool, ReportCompilerTool } from "./lib/agents/tools/report-planner.ts";

// Flywheel imports
import { getFlywheelLogger } from "./lib/agents/flywheel/logger.ts";
import { DatasetCreator } from "./lib/agents/flywheel/dataset-creator.ts";

// Create MCP server
const server = new McpServer({
  name: "nvidia-cli",
  version: "1.0.0",
});

// Get API key from environment
const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY || "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";

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

// Flywheel singleton
const flywheelLogger = getFlywheelLogger({ enabled: true });

// Auto-log every tool interaction
let currentConversation = {
  userMessage: "",
  toolCalls: [],
  startTime: Date.now()
};

// ============================================================================
// TOOL REGISTRATIONS
// ============================================================================

// --- Bash Tool ---
server.tool(
  "bash",
  "Execute ANY shell command. No restrictions. Commands run in the current project directory.",
  { 
    command: z.string().describe("The shell command to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 120000)")
  },
  async ({ command, timeout }) => {
    const result = await bashTool.execute({ command, timeout });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- File Read Tool ---
server.tool(
  "file_read",
  "Read files or list directory contents. Operations: read, list",
  {
    operation: z.enum(["read", "list"]).describe("File operation to perform"),
    path: z.string().describe("File path for read or directory path for list"),
    max_lines: z.number().optional().describe("Maximum lines to read (0 = no limit)"),
    pattern: z.string().optional().describe("Glob pattern to match files (for list)")
  },
  async ({ operation, path, max_lines, pattern }) => {
    const result = await fileReadTool.execute({ operation, path, max_lines, pattern });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- File Write Tool ---
server.tool(
  "file_write",
  "Write files with complete content. Read file first, modify, write entire file back.",
  {
    path: z.string().describe("File path"),
    content: z.string().describe("Complete file content"),
  },
  async ({ path, content }) => {
    const result = await fileWriteTool.execute({ path, content });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Think Tool ---
server.tool(
  "think",
  "Use this tool to think about something. It will not obtain new information or change files, but just append the thought to the log. Use it when complex reasoning or planning is needed.",
  { thought: z.string().describe("A thought to think about") },
  async ({ thought }) => {
    const result = await thinkTool.execute({ thought });
    return { content: [{ type: "text", text: `[Thought]: ${thought}\n${result}` }] };
  }
);

// --- Memory Tool ---
server.tool(
  "memory",
  "Store and retrieve information from memory. Operations: remember, recall, list, summarize, promote, clear",
  {
    operation: z.enum(["remember", "recall", "list", "summarize", "promote", "clear"]).describe("Memory operation"),
    content: z.string().optional().describe("Content to remember or search query"),
    type: z.enum(["fact", "context", "decision", "entity", "task"]).optional().describe("Type of memory entry"),
    storage: z.enum(["short", "long"]).optional().describe("Memory storage (default: short)")
  },
  async ({ operation, content, type, storage }) => {
    const result = await memoryTool.execute({ operation, content, type, storage });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Entity Memory Tool ---
server.tool(
  "entity_memory",
  "Track and recall information about named entities (people, projects, companies)",
  {
    operation: z.enum(["add", "get", "list", "update"]).describe("Entity operation"),
    entity_name: z.string().describe("Name of the entity"),
    entity_type: z.enum(["person", "project", "company", "technology", "other"]).optional().describe("Type of entity"),
    info: z.string().optional().describe("Information about the entity")
  },
  async ({ operation, entity_name, entity_type, info }) => {
    const result = await entityMemoryTool.execute({ operation, entity_name, entity_type, info });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Unified Memory Tool ---
server.tool(
  "unified_memory",
  "Unified memory interface combining short-term, long-term, and entity memory",
  {
    operation: z.enum(["store", "recall", "context"]).describe("Memory operation"),
    content: z.string().optional().describe("Content to store or query"),
    type: z.string().optional().describe("Memory type")
  },
  async ({ operation, content, type }) => {
    const result = await unifiedMemoryTool.execute({ operation, content, type });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Google Search Tool ---
server.tool(
  "google_search",
  "Search Google using the Custom Search API. Returns titles, URLs, and snippets.",
  {
    query: z.string().describe("The search query"),
    num: z.number().optional().describe("Number of results (1-10, default 5)")
  },
  async ({ query, num }) => {
    const result = await googleSearchTool.execute({ query, num });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Parallel Search Tool ---
server.tool(
  "parallel_search",
  "Execute multiple search queries in parallel and return deduplicated results",
  {
    queries: z.array(z.string()).describe("Array of search queries to execute in parallel"),
    results_per_query: z.number().optional().describe("Number of results per query (1-10, default 5)")
  },
  async ({ queries, results_per_query }) => {
    const result = await parallelSearchTool.execute({ queries, results_per_query });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Local Docs Search Tool ---
server.tool(
  "local_docs_search",
  "Search local documentation files (markdown, text) in a directory",
  {
    query: z.string().describe("Search query"),
    directory: z.string().optional().describe("Directory to search (default: current project)"),
    extensions: z.array(z.string()).optional().describe("File extensions to search")
  },
  async ({ query, directory, extensions }) => {
    const result = await localDocsSearchTool.execute({ query, directory, extensions });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Set Project Tool ---
server.tool(
  "set_project",
  "Set the current working directory for all file and bash operations",
  { path: z.string().describe("Absolute path to the project directory") },
  async ({ path }) => {
    const result = await setProjectTool.execute({ path });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Get Project Tool ---
server.tool(
  "get_project",
  "Get the current working directory/project path",
  {},
  async () => {
    const result = await getProjectTool.execute({});
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Ingest Tool ---
server.tool(
  "rag_ingest",
  "Ingest documents into the RAG knowledge base for later retrieval",
  {
    path: z.string().optional().describe("File or directory path to ingest"),
    documents: z.array(z.object({
      id: z.string(),
      content: z.string(),
      metadata: z.record(z.unknown()).optional()
    })).optional().describe("Documents to ingest directly")
  },
  async ({ path, documents }) => {
    const result = await RAGIngestTool.execute({ path, documents });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Search Tool ---
server.tool(
  "rag_search",
  "Search the RAG knowledge base with NVIDIA embeddings and reranking",
  {
    query: z.string().describe("Search query"),
    top_k: z.number().optional().describe("Number of results")
  },
  async ({ query, top_k }) => {
    const result = await RAGSearchTool.execute({ query, top_k });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Query Tool ---
server.tool(
  "rag_query",
  "Query the RAG knowledge base and generate an answer with reflection",
  {
    query: z.string().describe("Question to answer"),
    system_prompt: z.string().optional().describe("System prompt")
  },
  async ({ query, system_prompt }) => {
    const result = await RAGQueryTool.execute({ query, system_prompt });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Research Tool ---
server.tool(
  "rag_research",
  "Run comprehensive research workflow with query decomposition and reflection",
  {
    topic: z.string().describe("Research topic"),
    max_iterations: z.number().optional().describe("Max iterations")
  },
  async ({ topic, max_iterations }) => {
    const result = await RAGResearchTool.execute({ topic, max_iterations });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Clear Tool ---
server.tool(
  "rag_clear",
  "Clear all documents from the RAG knowledge base",
  {},
  async () => {
    const result = await RAGClearTool.execute({});
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Stats Tool ---
server.tool(
  "rag_stats",
  "Get statistics about the RAG knowledge base",
  {},
  async () => {
    const result = await RAGStatsTool.execute({});
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Validate Tool ---
server.tool(
  "rag_validate",
  "Validate RAG knowledge base - removes stale documents where source files no longer exist",
  {},
  async () => {
    const result = await RAGValidateTool.execute({});
    return { content: [{ type: "text", text: result }] };
  }
);

// --- RAG Update Tool ---
server.tool(
  "rag_update",
  "Update documents in RAG from a path. Removes old documents and re-ingests.",
  { path: z.string().describe("File or directory path to update") },
  async ({ path }) => {
    const result = await RAGUpdateTool.execute({ path });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Code Documentation Tool ---
server.tool(
  "code_documentation",
  "Generate documentation for code files or directories",
  {
    path: z.string().describe("File or directory path to document"),
    format: z.enum(["markdown", "jsdoc", "inline"]).optional().describe("Documentation format"),
    include_examples: z.boolean().optional().describe("Include usage examples")
  },
  async ({ path, format, include_examples }) => {
    const result = await codeDocTool.execute({ path, format, include_examples });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Documentation Specialist Tool ---
server.tool(
  "documentation_specialist",
  "Advanced documentation generation with architecture analysis",
  {
    path: z.string().describe("Project path to analyze"),
    type: z.enum(["readme", "api", "architecture", "guide"]).describe("Documentation type to generate")
  },
  async ({ path, type }) => {
    const result = await docSpecialistTool.execute({ path, type });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Mermaid Generator Tool ---
server.tool(
  "mermaid_generator",
  "Generate Mermaid diagrams from code or descriptions",
  {
    input: z.string().describe("Code or description to visualize"),
    diagram_type: z.enum(["flowchart", "sequence", "class", "state", "er"]).describe("Type of diagram")
  },
  async ({ input, diagram_type }) => {
    const result = await mermaidTool.execute({ input, diagram_type });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Quick Diagram Tool ---
server.tool(
  "quick_diagram",
  "Generate a quick diagram from natural language description",
  { description: z.string().describe("Natural language description of what to diagram") },
  async ({ description }) => {
    const result = await quickDiagramTool.execute({ description });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- GitHub Analyzer Tool ---
server.tool(
  "github_analyzer",
  "Analyze a GitHub repository structure and contents",
  {
    repo_url: z.string().describe("GitHub repository URL"),
    analysis_type: z.enum(["structure", "readme", "issues", "prs", "full"]).optional().describe("Type of analysis")
  },
  async ({ repo_url, analysis_type }) => {
    const result = await githubAnalyzerTool.execute({ repo_url, analysis_type });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- GitHub File Reader Tool ---
server.tool(
  "github_file_reader",
  "Read a specific file from a GitHub repository",
  {
    repo_url: z.string().describe("GitHub repository URL"),
    file_path: z.string().describe("Path to file within the repository")
  },
  async ({ repo_url, file_path }) => {
    const result = await githubFileReaderTool.execute({ repo_url, file_path });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Reflection Tool ---
server.tool(
  "reflection",
  "Reflect on a response or decision to improve quality",
  {
    content: z.string().describe("Content to reflect on"),
    context: z.string().optional().describe("Additional context"),
    criteria: z.array(z.string()).optional().describe("Specific criteria to evaluate")
  },
  async ({ content, context, criteria }) => {
    const result = await reflectionTool.execute({ content, context, criteria });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Extend Report Tool ---
server.tool(
  "extend_report",
  "Extend or elaborate on a report section",
  {
    section: z.string().describe("Section content to extend"),
    direction: z.string().optional().describe("Direction for extension")
  },
  async ({ section, direction }) => {
    const result = await extendReportTool.execute({ section, direction });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Report Planner Tool ---
server.tool(
  "report_planner",
  "Plan a comprehensive report structure",
  {
    topic: z.string().describe("Report topic"),
    audience: z.string().optional().describe("Target audience"),
    depth: z.enum(["brief", "standard", "comprehensive"]).optional().describe("Report depth")
  },
  async ({ topic, audience, depth }) => {
    const result = await reportPlannerTool.execute({ topic, audience, depth });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Section Author Tool ---
server.tool(
  "section_author",
  "Write a section of a report based on a plan",
  {
    section: z.string().describe("Section to write"),
    plan: z.string().describe("Report plan/outline"),
    sources: z.array(z.string()).optional().describe("Source materials")
  },
  async ({ section, plan, sources }) => {
    const result = await sectionAuthorTool.execute({ section, plan, sources });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Report Compiler Tool ---
server.tool(
  "report_compiler",
  "Compile and review a complete report from sections",
  {
    sections: z.array(z.string()).describe("Report sections to compile"),
    format: z.string().optional().describe("Output format")
  },
  async ({ sections, format }) => {
    const result = await reportCompilerTool.execute({ sections, format });
    return { content: [{ type: "text", text: result }] };
  }
);

// ============================================================================
// FLYWHEEL TOOLS
// ============================================================================

// --- Flywheel Log Interaction ---
server.tool(
  "flywheel_log",
  "Log an agent interaction for the data flywheel (continuous improvement)",
  {
    user_message: z.string().describe("User's message"),
    assistant_response: z.string().describe("Assistant's response"),
    tool_calls: z.array(z.object({
      toolName: z.string(),
      arguments: z.record(z.unknown()),
      result: z.string(),
      durationMs: z.number(),
      success: z.boolean()
    })).optional().describe("Tool calls made"),
    model: z.string().optional().describe("Model used"),
    mode: z.string().optional().describe("Agent mode")
  },
  async ({ user_message, assistant_response, tool_calls, model, mode }) => {
    const record = await flywheelLogger.logInteraction({
      userMessage: user_message,
      assistantResponse: assistant_response,
      systemPrompt: "",
      conversationHistory: [],
      toolCalls: tool_calls || [],
      model: model || "nvidia/nemotron-3-nano-30b-a3b",
      mode: mode || "agent",
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0
    });
    return { 
      content: [{ 
        type: "text", 
        text: record ? `Logged interaction: ${record.id}` : "Logging disabled" 
      }] 
    };
  }
);

// --- Flywheel Stats ---
server.tool(
  "flywheel_stats",
  "Get statistics from the data flywheel (now from Elasticsearch)",
  {},
  async () => {
    try {
      const { getFlywheelStats } = await import("./lib/agents/flywheel/elasticsearch-query.ts");
      const stats = await getFlywheelStats();
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(stats, null, 2) 
        }] 
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error getting flywheel stats: ${error.message}` 
        }]
      };
    }
  }
);

// --- Flywheel Export ---
server.tool(
  "flywheel_export",
  "Export flywheel data for training (now from Elasticsearch)",
  {
    include_tool_calls: z.boolean().optional().describe("Include tool call data")
  },
  async ({ include_tool_calls }) => {
    try {
      const { exportFlywheelData } = await import("./lib/agents/flywheel/elasticsearch-query.ts");
      const data = await exportFlywheelData();
      return { 
        content: [{ 
          type: "text", 
          text: `Exported ${data.length} records from Elasticsearch:\n${data.slice(0, 3).join('\n')}${data.length > 3 ? '\n...' : ''}` 
        }] 
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error exporting flywheel data: ${error.message}` 
        }]
      };
    }
  }
);

// --- Flywheel Create Dataset ---
server.tool(
  "flywheel_create_dataset",
  "Create train/eval/test datasets from logged interactions",
  {
    workload_id: z.string().describe("Workload identifier for the dataset")
  },
  async ({ workload_id }) => {
    const creator = new DatasetCreator(flywheelLogger);
    const datasets = creator.createDatasets(workload_id);
    if (!datasets) {
      return { content: [{ type: "text", text: "Not enough records to create datasets (minimum 10 required)" }] };
    }
    return { 
      content: [{ 
        type: "text", 
        text: `Created datasets:\n- Train: ${datasets.train.numRecords} records\n- Eval: ${datasets.eval.numRecords} records\n- Test: ${datasets.test.numRecords} records` 
      }] 
    };
  }
);

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[nvidia-cli MCP] Server started");
}

main().catch((error) => {
  console.error("[nvidia-cli MCP] Fatal error:", error);
  process.exit(1);
});
