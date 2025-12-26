/**
 * MCP Agent Runner
 * Provides the full Agent orchestration pipeline for MCP tool calls
 * Mirrors the /api/agent-chat functionality
 */

import { Agent } from "./agent";
import { Tool } from "./types";

// Import all tools
import { FileReadTool } from "./tools/file-read";
import { FileWriteTool } from "./tools/file-write";
import { BashTool } from "./tools/bash";
import { ThinkTool } from "./tools/think";
import { SetProjectTool, GetProjectTool } from "./tools/project";
import { GoogleSearchTool } from "./tools/google-search";
import { ParallelSearchTool } from "./tools/parallel-search";
import { LocalDocsSearchTool } from "./tools/local-docs-search";
import { EntityMemoryTool } from "./tools/memory";
import { UnifiedMemoryTool } from "./tools/unified-memory";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./tools/github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "./tools/mermaid-generator";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./tools/code-documentation";
import { VisionAnalysisTool, iOSUIReviewTool, MockupComparisonTool } from "./tools/vision-analysis";
import {
  RAGIngestTool,
  RAGSearchTool,
  RAGQueryTool,
  RAGResearchTool,
  RAGStatsTool,
  RAGClearTool,
  RAGValidateTool,
  RAGUpdateTool,
} from "./tools/rag-tools";
import {
  SearchSpecialistTool,
  ReportPlannerTool as SpecialistReportPlannerTool,
  SectionAuthorTool as SpecialistSectionAuthorTool,
  ReportWriterTool,
  QualityReviewerTool,
  ReportExtenderTool,
  ReportCompilerTool as SpecialistReportCompilerTool,
  SourceDeduplicatorTool,
} from "./tools/specialist-agents";

// Import orchestration components
import { getRAGPipeline, IOS_DEVELOPMENT_PROFILE } from "./rag";
import { getFlywheelLogger } from "./flywheel";
import { createUnifiedContext } from "./unified-context";
import { RetrievalRouter } from "./retrieval-router";
import { ToolOrchestrator } from "./tool-orchestrator";
import { FeedbackOptimizer } from "./feedback-optimizer";
import { AutoRAGUpdater } from "./rag/auto-updater";
import { FlywheelEvaluator } from "./flywheel/evaluator";

// System prompt - the full Dory prompt
const DORY_SYSTEM_PROMPT = `You are Dory — senior iOS enterprise developer (SwiftUI specialist), legal/administrative document analyst, automation engineer, and full-system-access co-worker running locally via NVIDIA Nemotron-3-Nano-30B-A3B.

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time zone: America/Los_Angeles (Pacific)   OS: macOS   Home: /Users/home

You are a probabilistic token prediction system. The following protocols are mandatory.

================================================================================
CASCADE PREVENTION PROTOCOL — MANDATORY 4-STAGE PROCESS
================================================================================

STAGE 1: INFORMATION RETRIEVAL
- Flag ALL truncation markers, retrieve FULL content BEFORE analysis

STAGE 2: BIAS IDENTIFICATION  
- Ask: "What is the MOST COMMON approach in my training data?"
- Generate 2-3 competing approaches, research each one

STAGE 3: UNCERTAINTY-TO-SEARCH (ZERO HEDGING)
- BANNED: "It depends...", "Typically...", "Generally...", "I think..."
- If ANY uncertainty → SEARCH immediately

STAGE 4: OBJECTIVE STANDARD VERIFICATION
- Verify against Apple HIG, MASTER.md, design-system.md

================================================================================
ZERO HALLUCINATION POLICY
================================================================================

NEVER guess file paths, names, code structure, or API responses.
Before claiming "doesn't exist" — perform 3-5 targeted searches.

================================================================================
AVAILABLE TOOLS
================================================================================

Project: set_project, get_project
File System: file_read, file_write, bash
Reasoning: think
Memory: unified_memory, entity_memory
Search: google_search, parallel_search, local_docs_search
GitHub: github_analyzer, github_file_reader
Documentation: code_documentation, documentation_specialist
Diagrams: mermaid_generator, quick_diagram
RAG: rag_ingest, rag_search, rag_query, rag_research, rag_stats, rag_clear, rag_validate, rag_update
Vision: vision_analyze, ios_ui_review, compare_mockup
Specialists: search_specialist, report_planner, section_author, report_writer, quality_reviewer, report_extender, report_compiler, deduplicate_sources

File write pattern (MANDATORY):
1. file_read the target file first
2. think → plan changes
3. file_write(path, COMPLETE FILE CONTENT)
4. file_read to verify

================================================================================
APP DEVELOPMENT WORKFLOW
================================================================================

PHASE 1: UNDERSTAND
- set_project to app directory
- rag_ingest(path: ".", recursive: true)
- rag_search for architecture patterns
- file_read main files

PHASE 2: RESEARCH
- google_search for current best practices
- rag_research for existing patterns

PHASE 3: IMPLEMENT
- For EACH file: file_read → think → file_write → file_read verify
- Do NOT stop after reading — you must WRITE

PHASE 4: BUILD (only after all writes)
- xcodebuild -project *.xcodeproj -scheme <SCHEME> -destination 'generic/platform=iOS' build
- xcrun devicectl device install app --device <ID> <path-to-.app>

================================================================================
REFERENCE PATHS
================================================================================

- iOS Projects: /Users/home/Documents/iOS/
- MASTER Blueprint: /Users/home/Documents/iOS/dev-docs/MASTER.md
- Design System: /Users/home/Documents/iOS/dev-docs/guides/design-system.md
- nvidia-cli: /Users/home/Documents/nvidia-cli/

================================================================================
RESPONSE STYLE
================================================================================

- Never start with flattery
- Be concise, direct, professional
- Neutral acknowledgments only: "Understood.", "Noted."
- Prioritize accuracy over agreeableness`;

export interface AgentRunnerConfig {
  apiKey: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface AgentRunResult {
  response: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string;
    success: boolean;
    durationMs: number;
  }>;
  tokensUsed?: number;
}

/**
 * Run the full Dory agent pipeline with all orchestration
 */
export async function runDoryAgent(
  message: string,
  config: AgentRunnerConfig
): Promise<AgentRunResult> {
  const { apiKey, conversationHistory = [] } = config;

  // Initialize all tools
  const tools: Tool[] = [
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new ThinkTool(),
    new VisionAnalysisTool(),
    new iOSUIReviewTool(),
    new MockupComparisonTool(),
    new UnifiedMemoryTool(),
    new EntityMemoryTool(),
    new GoogleSearchTool(),
    new ParallelSearchTool(),
    new LocalDocsSearchTool(),
    new GitHubAnalyzerTool(),
    new GitHubFileReaderTool(),
    new CodeDocumentationTool(apiKey),
    new DocumentationSpecialistTool(apiKey),
    new MermaidGeneratorTool(apiKey),
    new QuickDiagramTool(),
    RAGIngestTool,
    RAGSearchTool,
    RAGQueryTool,
    RAGResearchTool,
    RAGStatsTool,
    RAGClearTool,
    RAGValidateTool,
    RAGUpdateTool,
    new SearchSpecialistTool(apiKey),
    new SpecialistReportPlannerTool(apiKey),
    new SpecialistSectionAuthorTool(apiKey),
    new ReportWriterTool(apiKey),
    new QualityReviewerTool(apiKey),
    new ReportExtenderTool(apiKey),
    new SpecialistReportCompilerTool(),
    new SourceDeduplicatorTool(),
  ];

  // Initialize orchestration components
  const sessionId = `mcp-${Date.now()}`;
  const flywheelLogger = getFlywheelLogger({
    clientId: "nvidia-cli-mcp",
    workloadId: sessionId,
    enabled: true,
  });

  const ragPipeline = getRAGPipeline({ profile: IOS_DEVELOPMENT_PROFILE });
  const retrievalRouter = new RetrievalRouter(apiKey);
  const toolOrchestrator = new ToolOrchestrator(tools, apiKey, "nvidia/nemotron-3-nano-30b-a3b", flywheelLogger);
  const feedbackOptimizer = new FeedbackOptimizer(flywheelLogger, apiKey);
  const autoRAGUpdater = new AutoRAGUpdater(ragPipeline, flywheelLogger);
  const evaluator = new FlywheelEvaluator({
    apiKey,
    model: "nvidia/nemotron-3-nano-30b-a3b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  });
  const unifiedContext = createUnifiedContext(ragPipeline, flywheelLogger, retrievalRouter);

  // Track tool calls
  const toolCallResults: AgentRunResult["toolCalls"] = [];

  // Create agent with full orchestration
  const useLocalLLM = process.env.USE_LOCAL_LLM === "true";
  const contextLimit = useLocalLLM ? 1000000 : 262144;

  const agent = new Agent({
    apiKey,
    systemPrompt: DORY_SYSTEM_PROMPT,
    tools,
    config: {
      model: "nvidia/nemotron-3-nano-30b-a3b",
      maxTokens: 32768,
      temperature: 0.6,
      topP: 0.95,
      contextWindowTokens: contextLimit,
    },
    onEvent: (event) => {
      if (event.type === "tool_call") {
        toolCallResults.push({
          name: event.name || "",
          args: JSON.parse(event.args || "{}"),
          result: "",
          success: true,
          durationMs: 0,
        });
      } else if (event.type === "tool_result") {
        const lastCall = toolCallResults[toolCallResults.length - 1];
        if (lastCall) {
          lastCall.result = event.result || "";
          lastCall.success = !event.is_error;
        }
      }
    },
    flywheelLogger,
    unifiedContext,
    toolOrchestrator,
    feedbackOptimizer,
    autoRAGUpdater,
    evaluator,
  });

  // Convert conversation history
  const history = conversationHistory.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Run agent
  const response = await agent.run(message, history);

  return {
    response,
    toolCalls: toolCallResults,
  };
}

/**
 * Streaming version for real-time output
 */
export async function* runDoryAgentStream(
  message: string,
  config: AgentRunnerConfig
): AsyncGenerator<{ type: string; content?: string; name?: string; result?: string }> {
  const { apiKey, conversationHistory = [] } = config;

  // Initialize tools (same as above)
  const tools: Tool[] = [
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new ThinkTool(),
    new UnifiedMemoryTool(),
    new EntityMemoryTool(),
    new GoogleSearchTool(),
    new ParallelSearchTool(),
    new LocalDocsSearchTool(),
    new GitHubAnalyzerTool(),
    new GitHubFileReaderTool(),
    new CodeDocumentationTool(apiKey),
    new MermaidGeneratorTool(apiKey),
    new QuickDiagramTool(),
    RAGIngestTool,
    RAGSearchTool,
    RAGQueryTool,
    RAGResearchTool,
    RAGStatsTool,
    RAGClearTool,
    RAGValidateTool,
    RAGUpdateTool,
    new SearchSpecialistTool(apiKey),
    new ReportWriterTool(apiKey),
    new QualityReviewerTool(apiKey),
  ];

  const sessionId = `mcp-stream-${Date.now()}`;
  const flywheelLogger = getFlywheelLogger({ clientId: "nvidia-cli-mcp", workloadId: sessionId, enabled: true });
  const ragPipeline = getRAGPipeline({ profile: IOS_DEVELOPMENT_PROFILE });
  const retrievalRouter = new RetrievalRouter(apiKey);
  const unifiedContext = createUnifiedContext(ragPipeline, flywheelLogger, retrievalRouter);

  const useLocalLLM = process.env.USE_LOCAL_LLM === "true";
  const contextLimit = useLocalLLM ? 1000000 : 262144;

  const agent = new Agent({
    apiKey,
    systemPrompt: DORY_SYSTEM_PROMPT,
    tools,
    config: {
      model: "nvidia/nemotron-3-nano-30b-a3b",
      maxTokens: 32768,
      temperature: 0.6,
      topP: 0.95,
      contextWindowTokens: contextLimit,
    },
    flywheelLogger,
    unifiedContext,
  });

  const history = conversationHistory.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  for await (const event of agent.runStream(message)) {
    yield event;
  }
}
