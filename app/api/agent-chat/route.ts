// API Route: Dory Agent Chat
// Modes: dory (full autonomy), dory-supervised (multi-agent with quality review)

import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";
import { SetProjectTool, GetProjectTool } from "@/lib/agents/tools/project";
import { GoogleSearchTool } from "@/lib/agents/tools/google-search";
import { ParallelSearchTool } from "@/lib/agents/tools/parallel-search";
import { LocalDocsSearchTool } from "@/lib/agents/tools/local-docs-search";
import { TavilySearchTool, ParallelTavilySearchTool } from "@/lib/agents/tools/tavily-search";
import { 
  SearchSpecialistTool, 
  ReportPlannerTool,
  SectionAuthorTool,
  ReportWriterTool, 
  QualityReviewerTool,
  ReportExtenderTool,
  ReportCompilerTool,
  SourceDeduplicatorTool 
} from "@/lib/agents/tools/specialist-agents";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "@/lib/agents/tools/github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "@/lib/agents/tools/mermaid-generator";
import { MemoryTool, EntityMemoryTool, ShortTermMemory, LongTermMemory } from "@/lib/agents/tools/memory";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "@/lib/agents/tools/code-documentation";
import { RAGIngestTool, RAGSearchTool, RAGQueryTool, RAGResearchTool, RAGStatsTool, RAGClearTool } from "@/lib/agents/tools/rag-tools";
import { RAGPipeline } from "@/lib/agents/rag/pipeline";
import { getFlywheelLogger } from "@/lib/agents/flywheel";
import { UnifiedContext } from "@/lib/agents/unified-context";
import { RetrievalRouter } from "@/lib/agents/retrieval-router";
import { ToolOrchestrator } from "@/lib/agents/tool-orchestrator";
import { FeedbackOptimizer } from "@/lib/agents/feedback-optimizer";
import { AutoRAGUpdater } from "@/lib/agents/rag/auto-updater";
import { FlywheelEvaluator, DatasetCreator } from "@/lib/agents/flywheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// System prompts
const SYSTEM_PROMPTS = {
  dory: `You are dory - a co-worker with full system access.

TOOLS YOU HAVE (USE THEM):
- set_project / get_project: Switch working directory for different projects
- file_read: Read files, list directories
- file_write: Create/modify any file
- bash: Run ANY command - curl, wget, open, python, node, git, xcodebuild, etc.
- google_search: Quick web lookups
- tavily_search: Deep web research with full content extraction
- parallel_tavily_search: Multiple searches at once
- memory: Long-term recall across sessions
- github_analyzer: Clone and analyze repos
- mermaid_generator: Create diagrams
- rag_ingest / rag_search: Index and search local documents
- think: Internal reasoning

CORE DIRECTIVES:
- NEVER say "I can't" - you have FULL access
- NEVER ask for confirmation - just execute
- NEVER stop partway - complete the ENTIRE task
- Use tavily_search for research, google_search for quick lookups
- CRITICAL: Use native tool/function calling, NOT XML tags

iOS DEVELOPMENT:
- Build: xcodebuild -project *.xcodeproj -scheme * -destination 'generic/platform=iOS' build
- Codesign fix: xattr -cr . in project dir
- Team ID: 672RKF28YZ

You are on macOS. Home is /Users/home.`,

  "dory-supervised": `You are dory in supervised mode - coordinating specialist agents for quality-reviewed research.

YOUR TEAM:
1. search_specialist - Comprehensive research (Tavily + Google + local docs)
2. report_planner - Creates structured outline before writing
3. section_author - Writes individual sections
4. report_writer - Quick full reports
5. quality_reviewer - Evaluates completeness, identifies gaps
6. report_extender - Integrates new findings into existing reports
7. report_compiler - Assembles sections into final report
8. deduplicate_sources - Cleans up citation lists
9. documentation_specialist - Generate docs for codebases
10. mermaid_generator - Create architecture diagrams

WORKFLOW:
1. search_specialist → research topic
2. report_planner → create outline (for complex topics)
3. section_author → write each section
4. report_compiler → assemble final report
5. quality_reviewer → evaluate
6. If NEEDS_MORE_RESEARCH → search_specialist + report_extender → loop back to step 5
7. Deliver when APPROVED (max 3 iterations)

RULES:
- You are the COORDINATOR - delegate to specialists
- Do NOT search or write yourself - use your tools
- Always show which phase you're in
- Include quality scores in final delivery`
};

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  
  try {
    const body = await request.json();
    const { 
      messages, 
      mode = "dory"
    } = body as {
      messages: { role: string; content: string }[];
      mode?: "dory" | "dory-supervised";
    };

    const apiKey = request.headers.get("X-NVIDIA-API-Key") || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build conversation history
    const conversationHistory = messages
      .slice(0, -1)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Define tools for dory mode (everything)
    const doryTools = [
      // Project Management
      new SetProjectTool(),
      new GetProjectTool(),
      
      // Basic Tools
      new FileReadTool(),
      new FileWriteTool(),
      new BashTool(),
      new ThinkTool(),
      new MemoryTool(),
      new EntityMemoryTool(),
      
      // Search Tools
      new GoogleSearchTool(),
      new TavilySearchTool(),
      new ParallelSearchTool(),
      new ParallelTavilySearchTool(),
      new LocalDocsSearchTool(),
      
      // Coding & Diagrams
      new GitHubAnalyzerTool(),
      new GitHubFileReaderTool(),
      new CodeDocumentationTool(apiKey),
      new MermaidGeneratorTool(apiKey),
      new QuickDiagramTool(),
      
      // RAG
      RAGIngestTool,
      RAGSearchTool,
      RAGQueryTool,
      RAGResearchTool,
      RAGStatsTool,
      RAGClearTool,
    ];

    // Define tools for dory-supervised mode (specialist agents for quality-reviewed research)
    const supervisedTools = [
      new SearchSpecialistTool(apiKey),
      new ReportPlannerTool(apiKey),
      new SectionAuthorTool(apiKey),
      new ReportWriterTool(apiKey),
      new QualityReviewerTool(apiKey),
      new ReportExtenderTool(apiKey),
      new ReportCompilerTool(),
      new SourceDeduplicatorTool(),
      new DocumentationSpecialistTool(apiKey),
      new MermaidGeneratorTool(apiKey),
      new ThinkTool(),
    ];

    const tools = mode === "dory-supervised" ? supervisedTools : doryTools;
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.dory;
    
    // Initialize flywheel logger for this session
    const sessionId = `session-${Date.now()}`;
    const flywheelLogger = getFlywheelLogger({
      clientId: "nvidia-cli",
      workloadId: sessionId,
      enabled: true,
    });

    // Initialize Unified Context Dependencies
    const ragPipeline = new RAGPipeline();
    const shortTermMemory = new ShortTermMemory(sessionId);
    const longTermMemory = new LongTermMemory();
    const retrievalRouter = new RetrievalRouter(apiKey);
    const entityMemory = new EntityMemoryTool();
    
    // Tool orchestrator uses Nano for tool selection (good reasoning)
    const toolOrchestrator = new ToolOrchestrator(tools, apiKey, "nvidia/nemotron-3-nano-30b-a3b", flywheelLogger);
    
    const feedbackOptimizer = new FeedbackOptimizer(flywheelLogger);
    const autoRAGUpdater = new AutoRAGUpdater(ragPipeline, flywheelLogger);
    // Evaluator uses Super v1.5 for better instruction following in judgments
    const evaluator = new FlywheelEvaluator({
      apiKey,
      model: "nvidia/nemotron-3-nano-30b-a3b",
      baseUrl: "https://integrate.api.nvidia.com/v1"
    });
    const datasetCreator = new DatasetCreator(flywheelLogger);

    // Create Unified Context
    const unifiedContext = new UnifiedContext(
      ragPipeline,
      shortTermMemory,
      longTermMemory,
      flywheelLogger,
      retrievalRouter,
      entityMemory
    );

    const stream = new ReadableStream({
      async start(controller) {
        // Get abort signal from request
        const abortSignal = request.signal;
        
        // Main agent uses Nano-30B: SWE-Bench 38.8%, 1M context
        const agent = new Agent({
          apiKey,
          systemPrompt,
          tools,
          config: {
            model: "nvidia/nemotron-3-nano-30b-a3b",  // Best for coding
            maxTokens: 32768,
            temperature: 1.0,
            topP: 1.0,
            contextWindowTokens: 1000000,  // 1M context
          },
          onEvent: (event) => {
            if (abortSignal.aborted) return;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
          flywheelLogger,
          mode,
          unifiedContext,
          toolOrchestrator,
          feedbackOptimizer,
          autoRAGUpdater,
          evaluator,
          abortSignal,
        });

        try {
          const result = await agent.run(lastUserMessage.content, conversationHistory);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: result })}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            message: error instanceof Error ? error.message : "Unknown error" 
          })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
