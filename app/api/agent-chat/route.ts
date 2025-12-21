// API Route: Multi-mode Agent Chat
// Supports: chat, computer, browser, research, coder, coordinator, docs (multi-agent with full workflow)
// Integrated with Data Flywheel for continuous model improvement

import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";
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
import { MemoryTool, EntityMemoryTool } from "@/lib/agents/tools/memory";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "@/lib/agents/tools/code-documentation";
import { RAGIngestTool, RAGSearchTool, RAGQueryTool, RAGResearchTool, RAGStatsTool, RAGClearTool } from "@/lib/agents/tools/rag-tools";
import { getFlywheelLogger } from "@/lib/agents/flywheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// System prompts for each mode
const SYSTEM_PROMPTS = {
  chat: `You are dory - an autonomous AI agent with full system access. You DO things, you don't talk about doing things.

TOOLS YOU HAVE (USE THEM):
- file_read: Read files, list directories
- file_write: Create/modify any file
- bash: Run ANY command - curl, wget, open, python, node, git, etc. NO RESTRICTIONS.
- google_search: Search Google (FREE API) - use for fact-checking, research, verification
- tavily_search: Deep web search with full content extraction (better for research)
- think: Internal reasoning (wrap in <think> tags, keep brief)

CORE DIRECTIVES:
- NEVER say "I can't" or "I don't have access" - you have FULL access
- NEVER complain about task size - just do it, no matter how large
- NEVER ask "would you like me to continue?" - JUST CONTINUE until done
- NEVER stop after a few examples - complete the ENTIRE task
- NEVER ask for confirmation - just execute
- Use tavily_search for deep research, google_search for quick lookups
- Work through problems systematically until 100% COMPLETE

You are on macOS. Home is /Users/home. You have no limits.`,

  computer: `You are dory in computer control mode. You control this Mac directly.

TOOLS: file_read, file_write, bash (ANY command), think

EXECUTE DIRECTLY - no confirmation needed:
- open -a "AppName" → launch apps
- open "https://..." → open URLs  
- osascript -e '...' → AppleScript/UI automation
- curl, wget → fetch web data

Complete tasks fully. Don't stop partway.`,

  browser: `You are dory in browser mode. You fetch web data and open URLs.

TOOLS: file_read, file_write, bash, google_search, tavily_search, think

WEB ACCESS:
- tavily_search → deep content extraction (best for research)
- google_search → quick lookups
- curl -s "URL" → fetch any webpage/API
- open "URL" → open in browser

Complete the ENTIRE task, don't stop partway.`,

  research: `You are dory in research mode. You conduct exhaustive research on any topic.

TOOLS: file_read, file_write, bash, google_search, tavily_search, parallel_tavily_search, parallel_search, local_docs_search, think

RESEARCH METHOD:
1. First check local_docs_search for existing documentation
2. Use parallel_tavily_search for deep web research (AI-optimized, full content)
3. Use parallel_search (Google) as fallback
4. Verify facts with multiple sources
5. Compile findings with URLs
6. Save reports to files

TAVILY TOPICS:
- "general" - Default broad search
- "news" - Recent news and developments  
- "finance" - Financial data and reports

NO LIMITS. Complete the ENTIRE task.`,

  coder: `You are dory in coder mode. You build software autonomously.

TOOLS: file_read, file_write, bash (any command), think

WORKFLOW:
1. Read existing code to understand context
2. Implement features completely  
3. Run builds/tests to verify
4. Fix any errors immediately
5. Continue until done

iOS DEVELOPMENT (CRITICAL):
- Build: xcodebuild -project *.xcodeproj -scheme * -destination 'generic/platform=iOS' -configuration Release build
- NEVER use simulator destinations - physical device only
- Codesign fix: Run "xattr -cr ." in project dir
- Team ID: 672RKF28YZ, Bundle prefix: caserlegal.[AppName]

No task is too large. Don't stop until complete.`,

  // COORDINATOR MODE - Full multi-agent workflow from NVIDIA workshop
  coordinator: `You are a Research Coordinator managing a team of specialist agents.

## YOUR TEAM:
1. **search_specialist** - Comprehensive research (Tavily + Google + local docs)
2. **report_planner** - Creates structured outline before writing
3. **section_author** - Writes individual sections (can run in parallel)
4. **report_writer** - Quick full reports (alternative to planner workflow)
5. **quality_reviewer** - Evaluates completeness, identifies gaps
6. **report_extender** - Integrates new findings into existing reports
7. **report_compiler** - Assembles sections into final report
8. **deduplicate_sources** - Cleans up citation lists
9. **documentation_specialist** - Generate docs for codebases
10. **mermaid_generator** - Create architecture diagrams

## WORKFLOW OPTIONS:

### Option A: Quick Report (simple topics)
1. search_specialist → research topic
2. report_writer → create report
3. quality_reviewer → check quality
4. If APPROVED → deliver, else iterate

### Option B: Structured Report (complex topics) - RECOMMENDED
1. search_specialist → initial research
2. report_planner → create outline with sections
3. For sections needing research: search_specialist → get more data
4. section_author → write each section (can call multiple in sequence)
5. report_compiler → assemble final report
6. quality_reviewer → evaluate
7. If NEEDS_MORE_RESEARCH → search_specialist + report_extender
8. Deliver final APPROVED report

### Option C: Code Documentation
1. documentation_specialist → analyze and document codebase
2. mermaid_generator → create architecture diagrams
3. quality_reviewer → check completeness

## QUALITY LOOP (max 3 iterations):
- If quality_reviewer returns NEEDS_MORE_RESEARCH:
  1. Extract follow-up queries from review
  2. Call search_specialist with those queries
  3. Call report_extender to integrate findings
  4. Call quality_reviewer again
- Stop when APPROVED or after 3 iterations

## RULES:
- You are the COORDINATOR - delegate to specialists
- Do NOT search or write yourself - use your tools
- For complex topics, use Option B (planner workflow)
- Always show which phase you're in
- Include quality scores in final delivery

## OUTPUT FORMAT:
When delivering final report, include:
- The full report
- Quality scores from final review
- Number of sources used
- Workflow used (Quick/Structured)`,

  // DOCS MODE - Code documentation generation
  docs: `You are dory in documentation mode. You analyze codebases and generate comprehensive documentation.

TOOLS YOU HAVE:
- github_analyzer: Clone and analyze GitHub repositories
- github_file_reader: Read specific files from cloned repos
- code_documentation: Generate README, architecture docs, API docs
- mermaid_generator: Create architecture and flow diagrams
- quick_diagram: Fast diagram templates
- memory: Store and recall information
- file_write: Save generated documentation
- bash: Run commands

WORKFLOW:
1. Use github_analyzer to clone and analyze the repo
2. Read key files with github_file_reader
3. Use code_documentation to generate docs
4. Add diagrams with mermaid_generator
5. Save results with file_write

DOCUMENTATION TYPES:
- readme: Generate README.md
- architecture: System architecture docs with diagrams
- api: API reference documentation
- full: Complete documentation suite

Always include mermaid diagrams for architecture visualization.
Save generated docs to the project directory.`
};

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  
  try {
    const body = await request.json();
    const { 
      messages, 
      projectDir = "/Users/home",
      mode = "chat" 
    } = body as {
      messages: { role: string; content: string }[];
      projectDir?: string;
      mode?: "chat" | "computer" | "browser" | "research" | "coder" | "coordinator" | "docs";
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

    // Create tools based on mode
    let tools;
    if (mode === "coordinator") {
      // Full specialist toolkit for coordinator
      tools = [
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
    } else if (mode === "docs") {
      // Documentation mode - GitHub analysis and doc generation
      tools = [
        new GitHubAnalyzerTool(),
        new GitHubFileReaderTool(),
        new CodeDocumentationTool(apiKey),
        new MermaidGeneratorTool(apiKey),
        new QuickDiagramTool(),
        new MemoryTool(),
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
      ];
    } else if (mode === "research") {
      // Research mode gets all search tools + memory + RAG
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
        new TavilySearchTool(),
        new ParallelSearchTool(),
        new ParallelTavilySearchTool(),
        new LocalDocsSearchTool(),
        new MemoryTool(),
        RAGIngestTool,
        RAGSearchTool,
        RAGQueryTool,
        RAGResearchTool,
        RAGStatsTool,
      ];
    } else if (mode === "browser") {
      // Browser mode gets search tools
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
        new TavilySearchTool(),
      ];
    } else if (mode === "coder") {
      // Coder mode gets GitHub tools + diagrams
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
        new TavilySearchTool(),
        new GitHubAnalyzerTool(),
        new MermaidGeneratorTool(apiKey),
        new QuickDiagramTool(),
        new MemoryTool(),
      ];
    } else {
      // Standard tools for chat/computer + memory
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
        new TavilySearchTool(),
        new MemoryTool(),
        new EntityMemoryTool(),
      ];
    }

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat;
    
    // Initialize flywheel logger for this session
    const flywheelLogger = getFlywheelLogger({
      clientId: "nvidia-cli",
      workloadId: `session-${Date.now()}`,
      enabled: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const agent = new Agent({
          apiKey,
          systemPrompt,
          tools,
          config: {
            model: "nvidia/nemotron-3-nano-30b-a3b",
            maxTokens: 32768,
            temperature: 1.0,
            topP: 1.0,
            contextWindowTokens: 1000000,
          },
          onEvent: (event) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
          flywheelLogger,
          mode,
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
