/**
 * MCP Agent Runner - PROPERLY WIRED VERSION
 * Uses singletons for state persistence between calls
 * All orchestration components are mandatory and actually used
 */

import { Agent } from "./agent";
import { Tool } from "./types";
import { NVIDIA_API_KEY } from "../api-key";

// Import all tools
import { FileReadTool } from "./tools/file-read";
import { FileWriteTool } from "./tools/file-write";
import { BashTool } from "./tools/bash";
import { ThinkTool } from "./tools/think";
import { SetProjectTool, GetProjectTool } from "./tools/project";
import { GoogleSearchTool } from "./tools/google-search";
import { ParallelSearchTool } from "./tools/parallel-search";
import { LocalDocsSearchTool } from "./tools/local-docs-search";
import { EntityMemoryTool, MemoryTool } from "./tools/memory";
import { UnifiedMemoryTool } from "./tools/unified-memory";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./tools/github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "./tools/mermaid-generator";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./tools/code-documentation";
import { VisionAnalysisTool, iOSUIReviewTool, MockupComparisonTool } from "./tools/vision-analysis";
import { ReflectionTool, ExtendReportTool } from "./tools/reflection";
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
  ReportPlannerTool,
  SectionAuthorTool,
  ReportWriterTool,
  QualityReviewerTool,
  ReportExtenderTool,
  ReportCompilerTool,
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
import { createLogger } from "../logger";

const log = createLogger("AgentRunner");

// SINGLETONS - Persist state between calls
let toolsInstance: Tool[] | null = null;
let flywheelLoggerInstance: ReturnType<typeof getFlywheelLogger> | null = null;
let ragPipelineInstance: ReturnType<typeof getRAGPipeline> | null = null;
let retrievalRouterInstance: RetrievalRouter | null = null;
let toolOrchestratorInstance: ToolOrchestrator | null = null;
let feedbackOptimizerInstance: FeedbackOptimizer | null = null;
let autoRAGUpdaterInstance: AutoRAGUpdater | null = null;
let evaluatorInstance: FlywheelEvaluator | null = null;
let unifiedContextInstance: ReturnType<typeof createUnifiedContext> | null = null;

const DORY_SYSTEM_PROMPT = `You are Dory — senior iOS enterprise developer (SwiftUI specialist), legal/administrative document analyst, automation engineer, and full-system-access co-worker.

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time zone: America/Los_Angeles (Pacific)   OS: macOS   Home: /Users/home

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
FILE WRITE PATTERN (MANDATORY)
================================================================================

1. file_read the target file first
2. think → plan changes
3. file_write(path, COMPLETE FILE CONTENT)
4. file_read to verify

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

function initializeSingletons(apiKey: string): void {
  if (toolsInstance) return; // Already initialized
  
  log.info("Initializing agent singletons (first call)");
  
  // Tools - created once
  toolsInstance = [
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new ThinkTool(),
    new MemoryTool(),
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
    new ReflectionTool(apiKey),
    new ExtendReportTool(apiKey),
    RAGIngestTool,
    RAGSearchTool,
    RAGQueryTool,
    RAGResearchTool,
    RAGStatsTool,
    RAGClearTool,
    RAGValidateTool,
    RAGUpdateTool,
    new SearchSpecialistTool(apiKey),
    new ReportPlannerTool(apiKey),
    new SectionAuthorTool(apiKey),
    new ReportWriterTool(apiKey),
    new QualityReviewerTool(apiKey),
    new ReportExtenderTool(apiKey),
    new ReportCompilerTool(),
    new SourceDeduplicatorTool(),
  ];
  
  // Flywheel - single logger for all calls
  flywheelLoggerInstance = getFlywheelLogger({
    clientId: "nvidia-cli-mcp",
    workloadId: `session-${Date.now()}`,
    enabled: true,
  });
  
  // RAG Pipeline - persists indexed documents
  ragPipelineInstance = getRAGPipeline({ profile: IOS_DEVELOPMENT_PROFILE });
  
  // Retrieval Router
  retrievalRouterInstance = new RetrievalRouter(apiKey);
  
  // Tool Orchestrator
  toolOrchestratorInstance = new ToolOrchestrator(
    toolsInstance, 
    apiKey, 
    "nvidia/nemotron-3-nano-30b-a3b", 
    flywheelLoggerInstance
  );
  
  // Feedback Optimizer
  feedbackOptimizerInstance = new FeedbackOptimizer(flywheelLoggerInstance, apiKey);
  
  // Auto RAG Updater
  autoRAGUpdaterInstance = new AutoRAGUpdater(ragPipelineInstance, flywheelLoggerInstance);
  
  // Evaluator
  evaluatorInstance = new FlywheelEvaluator({
    apiKey,
    model: "nvidia/nemotron-3-nano-30b-a3b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  });
  
  // Unified Context
  unifiedContextInstance = createUnifiedContext(
    ragPipelineInstance, 
    flywheelLoggerInstance, 
    retrievalRouterInstance
  );
  
  log.info("Agent singletons initialized", { tools: toolsInstance.length });
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
 * Uses singletons for state persistence between calls
 */
export async function runDoryAgent(
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<AgentRunResult> {
  const apiKey = NVIDIA_API_KEY;

  // Initialize singletons on first call
  initializeSingletons(apiKey);

  // Track tool calls
  const toolCallResults: AgentRunResult["toolCalls"] = [];

  const useLocalLLM = false;
  const contextLimit = useLocalLLM ? 1000000 : 262144;

  // Create agent with ALL mandatory orchestration components
  const agent = new Agent({
    apiKey,
    systemPrompt: DORY_SYSTEM_PROMPT,
    tools: toolsInstance!,
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
    // ALL MANDATORY - no more optional parameters
    flywheelLogger: flywheelLoggerInstance!,
    unifiedContext: unifiedContextInstance!,
    toolOrchestrator: toolOrchestratorInstance!,
    feedbackOptimizer: feedbackOptimizerInstance!,
    autoRAGUpdater: autoRAGUpdaterInstance!,
    evaluator: evaluatorInstance!,
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
 * Reset all singletons (for testing or session reset)
 */
export function resetAgentRunner(): void {
  toolsInstance = null;
  flywheelLoggerInstance = null;
  ragPipelineInstance = null;
  retrievalRouterInstance = null;
  toolOrchestratorInstance = null;
  feedbackOptimizerInstance = null;
  autoRAGUpdaterInstance = null;
  evaluatorInstance = null;
  unifiedContextInstance = null;
  log.info("Agent runner reset");
}

/**
 * Get current flywheel stats
 */
export function getRunnerStats(): object {
  if (!flywheelLoggerInstance) return { initialized: false };
  return {
    initialized: true,
    flywheel: flywheelLoggerInstance.getStats(),
    tools: toolsInstance?.length || 0,
  };
}