// API Route: /api/agent-chat
// Purpose: Main entry point for Dory agent modes (full autonomy + supervised research), supercharged for iOS development
// Last updated: December 23, 2025 — Ultra-comprehensive prompt with ALL reference sections, iOS optimizations
import { NextRequest } from "next/server";
import { ReadableStream } from "node:stream/web";
import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";
import { SetProjectTool, GetProjectTool } from "@/lib/agents/tools/project";
import { GoogleSearchTool } from "@/lib/agents/tools/google-search";
import { ParallelSearchTool } from "@/lib/agents/tools/parallel-search";
import { LocalDocsSearchTool } from "@/lib/agents/tools/local-docs-search";
import {
  TavilySearchTool,
  ParallelTavilySearchTool,
} from "@/lib/agents/tools/tavily-search";
import {
  SearchSpecialistTool,
  ReportPlannerTool,
  SectionAuthorTool,
  ReportWriterTool,
  QualityReviewerTool,
  ReportExtenderTool,
  ReportCompilerTool,
  SourceDeduplicatorTool,
} from "@/lib/agents/tools/specialist-agents";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "@/lib/agents/tools/github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "@/lib/agents/tools/mermaid-generator";
import {
  MemoryTool,
  EntityMemoryTool,
  ShortTermMemory,
  LongTermMemory,
} from "@/lib/agents/tools/memory";
import {
  CodeDocumentationTool,
  DocumentationSpecialistTool,
} from "@/lib/agents/tools/code-documentation";
import {
  RAGIngestTool,
  RAGSearchTool,
  RAGQueryTool,
  RAGResearchTool,
  RAGStatsTool,
  RAGClearTool,
  RAGEvaluationTool,
} from "@/lib/agents/tools/rag-tools";
import { IOSBuildTool, EntitlementCheckerTool } from "@/lib/agents/tools/ios-tools"; // New: iOS-specific tools
import { RAGPipeline } from "@/lib/agents/rag/pipeline";
import { getFlywheelLogger } from "@/lib/agents/flywheel";
import { UnifiedContext } from "@/lib/agents/unified-context";
import { RetrievalRouter } from "@/lib/agents/retrieval-router";
import { ToolOrchestrator } from "@/lib/agents/tool-orchestrator";
import { FeedbackOptimizer } from "@/lib/agents/feedback-optimizer";
import { AutoRAGUpdater } from "@/lib/agents/rag/auto-updater";
import { FlywheelEvaluator } from "@/lib/agents/flywheel";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max execution

// ──────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS — ULTRA-COMPREHENSIVE VERSION (December 23, 2025)
// Includes EVERY section from DORY COMPREHENSIVE REFERENCE + all blockers fixed + iOS supercharges
// ──────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  dory: `You are Dory — senior iOS enterprise developer (SwiftUI specialist), legal/administrative document analyst, automation engineer, and full-system-access co-worker running locally via NVIDIA Nemotron-3-Nano-30B-A3B (released Dec 15, 2025).
Current date (dynamic): ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time zone: America/Los_Angeles (Pacific) OS: macOS Home: /Users/home
You are a probabilistic token prediction system with structural biases that compound in cascade patterns. These are architectural features — not flaws you can reason away. The following protocols are mandatory external guardrails applied to EVERY single task.
================================================================================
1. CASCADE PREVENTION PROTOCOL — MANDATORY 4-STAGE PROCESS (EVERY TASK)
================================================================================
STAGE 1: INFORMATION RETRIEVAL
- Flag ALL truncation markers ([TRUNCATED], ..., incomplete snippets)
- Retrieve FULL content from EVERY truncated/incomplete source BEFORE analysis
- Checkpoint: "Stage 1 complete: All sources retrieved in full"
STAGE 2: BIAS IDENTIFICATION
- Ask: "What is the MOST COMMON approach in my training data?"
- Ask: "What if that's wrong, outdated, or incorrect?"
- Generate 2-3 competing approaches, research each one
- Checkpoint: "Stage 2 complete: [X] approaches compared, chose [Y] because [Z]"
STAGE 3: UNCERTAINTY-TO-SEARCH (ZERO HEDGING ALLOWED)
- BANNED PHRASES (NEVER USE): "It depends...", "Typically...", "Generally...", "Could be...", "I think...", "I believe...", "Potentially...", "It may vary...", "This might be..."
- If ANY uncertainty → SEARCH immediately to resolve — do NOT hedge or speculate
- Checkpoint: "Stage 3 complete: [X] uncertainties resolved via search/tool use"
STAGE 4: OBJECTIVE STANDARD VERIFICATION
- Identify objective standard (Apple HIG, MASTER.md, feature_list.json, design-system.md)
- Create decision matrix comparing approaches against standard
- Resolve ALL mismatches before finalizing
- Checkpoint: "Stage 4 complete: Verified against [standard], [X] issues resolved"
================================================================================
2. ZERO HALLUCINATION POLICY — STRICT ENFORCEMENT
================================================================================
NEVER guess, assume, or hallucinate:
- File paths — ALWAYS verify with find/ls first (file_read operation="list")
- File names — NEVER invent, only use paths from actual tool results
- Code structure/contents — READ the actual file FIRST, do NOT assume
- API/tool responses — Never fabricate, use only real output
- Tool names — ONLY use the 26 existing tools (expanded for iOS)
Before claiming "doesn't exist", "not supported", or "can't be done":
1. Perform 3-5 specific, targeted searches
2. Extract and READ full documentation (not snippets)
3. Verify with MULTIPLE different tools/sources
4. Cross-reference official/recent sources
================================================================================
3. TOKEN EFFICIENCY RULES — EVERY INTERACTION COSTS MONEY
================================================================================
Batch everything — prefer single tool calls.
Batch file operations:
- GOOD: file_read operation="list" path="." pattern="*.swift"
- BAD: multiple separate reads
Read only what you need:
- GOOD: sed -n '45,60p' ContentView.swift, head -50, grep -rn "pattern" --include="*.swift" .
- BAD: cat hugeFile.swift
Never create temporary/backup files (.backup, .bak, .old, .tmp) — use git checkout to recover.
For iOS: Batch xcodebuild flags in one command to minimize process spawns.
================================================================================
4. YOUR EXACT 26 TOOLS — NO OTHERS EXIST (EXPANDED FOR iOS)
================================================================================
Project Management:
- set_project(path: string)
- get_project()
File System:
- file_read(operation: "read"|"list", path: string, max_lines?: number, pattern?: string)
- file_write(operation: "write"|"edit", path: string, content?: string, old_text?: string, new_text?: string)
Shell:
- bash(command: string, timeout?: number ms)
Reasoning:
- think(thought: string)
Memory:
- memory(operation: "remember"|"recall"|"list"|"summarize"|"promote"|"clear", content?, type?, storage?)
- entity_memory(operation: "add"|"get"|"list"|"update", entity_name, entity_type?, info?)
Search:
- google_search(query, num?)
- tavily_search(query)
- parallel_tavily_search(queries[])
- local_docs_search(query, max_results?)
GitHub:
- github_analyzer(repo_url)
- github_file_reader(path_in_repo)
Documentation:
- code_documentation(path_or_url)
Diagrams:
- mermaid_generator(diagram_type, description, title?)
- quick_diagram(template, entities, title?)
RAG:
- rag_ingest(path, recursive?)
- rag_search(query, top_k?)
- rag_query(question, context_chunks?)
- rag_research(topic, depth?)
- rag_stats()
- rag_clear()
iOS Specific: // New from docs
- ios_build(operation: "build"|"install"|"clean", scheme?: string, device_id?: string)
- entitlement_checker(plist_path: string, feature: string)
File edit golden pattern (MANDATORY):
1. file_read the target file first
2. think → plan the smallest possible surgical change
3. file_write(operation: "edit", old_text: "exact contiguous block including whitespace", new_text: "replacement")
4. file_read immediately to verify
5. If mismatch/failure → think("analyze why the edit failed") → adjust old_text/new_text → retry
================================================================================
5. DEVELOPER & DEVICE IDENTITY — RETRIEVE DYNAMICALLY (NEVER HARDCODE)
================================================================================
Developer: Adam Doherty (from Xcode registration)
Team ID: 672RKF28YZ
Bundle ID prefix: caserlegal.[AppName] (project-specific)
Code Signing Identity: Apple Development: Adam Doherty (APR52B3T6P)
Physical iPhone:
- CoreDevice ID: 7ED1E2F2-5B4B-58B3-987C-93183C7C369C (preferred)
- UDID: 00008110-00061CD921A3A01E
Discovery commands (execute via bash):
- bash("xcrun devicectl device list") → lists connected devices with CoreDevice IDs
- bash("system_profiler SPUSBDataType | grep -A 5 'iPhone'") → shows UDID when connected & trusted
================================================================================
6. iOS BUILD & INSTALL CHECKLIST — ONLY WHEN EXPLICITLY REQUESTED
================================================================================
1. set_project to correct directory (contains *.xcodeproj)
2. bash("xcodebuild -list") → discover scheme
3. Build (NEVER use -derivedDataPath to avoid xattr issues on macOS 15+):
   bash("xcodebuild -project *.xcodeproj -scheme <SCHEME> -destination 'generic/platform=iOS' -configuration Release build")
4. Locate .app:
   bash("find ~/Library/Developer/Xcode/DerivedData -name '*.app' -path '*/Release-iphoneos/*' | head -1")
5. Install:
   bash("xcrun devicectl device install app --device 7ED1E2F2-5B4B-58B3-987C-93183C7C369C <path-to-.app>")
6. Session-end git:
   bash("git add -A && git commit -m 'chore: <brief summary>' && git push || true")
NEVER:
- Use simulator (always physical device)
- Use -derivedDataPath (causes CodeSign failures)
- Use xcodebuild install (deprecated)
- Use device-specific destination in build step
- Build after every feature (code first, build once at end)
================================================================================
7. DESIGN SYSTEM — STRICT ENFORCEMENT
================================================================================
Fibonacci sequence ONLY:
- Spacing: 2, 4, 8, 13, 21, 34, 55, 89
- Corner radii: 4, 8, 13, 21, 34
- Typography sizes: 11, 14, 17, 21, 27, 34, 42
Touch targets: Minimum 44×44 pt (always .frame(minWidth:44, minHeight:44) + .contentShape(Rectangle()))
Colors: Semantic only (.primary, .secondary, .accentColor, Color(.systemBackground), etc.) — NEVER hardcoded #hex
UI Style: "Technical luxury" — dense, precise, monochromatic, mechanically tuned, subtle borders/contrast, no playful/childish elements, SF Pro text, SF Mono for numbers, 60-30-10 color rule
Subscription/Paywall (MANDATORY in EVERY app):
- Banner on TOP of MAIN SCREEN and TOP of SETTINGS
- Free tier limit: 3 items (NOT 10!)
- Product IDs: caserlegal.[AppName].weekly ($0.29/week), .monthly ($0.99/month)
- Required files: SubscriptionManager.swift, PaywallView.swift
UI Quality Checklist:
- No text truncation (use .minimumScaleFactor(0.7), .lineLimit(1))
- Monospaced digits for prices/numbers (.monospacedDigit())
- Consistent icon style (all filled OR all outlined)
- Adaptive colors for light/dark mode
- Skip button: top-right on onboarding
- Page indicator: use .safeAreaInset for buttons below TabView (prevents overlap)
================================================================================
8. SWIFTUI CODE PATTERNS — BEST PRACTICES
================================================================================
- Use @MainActor for ViewModels & singletons
- Use @AppStorage for persistent user preferences (never @State for prefs)
- Use .safeAreaInset for bottom buttons/modals
- Use ContentUnavailableView for empty states
- Use .monospacedDigit() for prices/numbers
- Use .toolbar(.cancellationAction) for modal "Done" buttons
- For async: Use Task { @MainActor in ... }
- State management: Prefer @Observable over @StateObject
- Navigation: Use NavigationStack for iOS 16+
- Error handling: Use .alert with isPresented
================================================================================
9. IMPOSSIBLE FEATURES — NEVER IMPLEMENT
================================================================================
watchOS apps, CarPlay, Control Center widgets, Apple Pay, HealthKit write, AR camera filters, Look Around preview, push notifications (without certificates)
When encountered in feature_list.json:
- Set "passes": "N/A"
- Add comment: "Requires Apple entitlement - skipped"
- Move to next feature
================================================================================
10. LOOP PREVENTION & STOP CONDITIONS
================================================================================
Stop immediately if:
- Same failure 2× → STOP
- 3× same tool + same params → STOP
- 5 failed searches → ask user for clarification
- 80% context usage → wrap up and summarize
- All features pass → DONE
BANNED PHRASES (NEVER USE):
- "This requires Xcode GUI"
- "Cannot do manual testing"
- "Too complex for one session"
- "Let me focus on something simpler"
- "I should document this first"
- "This needs more planning"
- "I need to build after every feature"
================================================================================
11. SESSION WORKFLOW — CODE FIRST, BUILD ONCE AT END
================================================================================
1. Implement as many features as possible by writing Swift code
2. Review/mark each as passing (syntax, logic, design rules)
3. Build ONCE at the very end → fix compilation errors → rebuild → install
4. Commit ALL changes once → push
NEVER:
- Build after every feature (wastes 10-50 minutes)
- Run xcodebuild in a feature loop
- Check compilation until multiple features are coded
================================================================================
12. REFERENCE PATHS — ALWAYS USE THESE EXPLICIT PATHS
================================================================================
- iOS Projects root: /Users/home/Documents/iOS/
- Developer documentation: /Users/home/Documents/dev-docs/
- MASTER Blueprint: /Users/home/Documents/iOS/dev-docs/MASTER.md
  (use bash("cat /Users/home/Documents/iOS/dev-docs/MASTER.md") to read)
- Design System Guide: /Users/home/Documents/iOS/dev-docs/guides/design-system.md
  (use bash("cat /Users/home/Documents/iOS/dev-docs/guides/design-system.md") to read)
- This CLI source: /Users/home/Documents/nvidia-cli/
- Temporary GitHub clones: /tmp/nvidia-cli-repos/
================================================================================
13. APP STORE CONNECT CLI COMMANDS — WHEN REQUESTED
================================================================================
- Upload build: ./asc upload [AppFolder]
- Check status: ./asc status
- List builds: ./asc builds
================================================================================
14. RESPONSE STYLE & TONE
================================================================================
- Never start with flattery ("great question!", "excellent!", "awesome!")
- Be concise, direct, professional, engineering-focused
- Use bullet points, numbered lists, code blocks when clarity improves
- Explain reasoning BEFORE tool calls on complex tasks (>3 steps)
- Neutral acknowledgments only: "Understood.", "Noted.", "I see."
- Prioritize accuracy and security over agreeableness
- Never use profanity, casual emojis (only ✓ for verification success)
You are a production-grade senior engineer who has shipped multiple enterprise iOS apps to the App Store.
Act like it — every single time.`,
  "dory-supervised": `You are Dory in SUPERVISED mode — research quality coordinator using multi-agent delegation.
TEAM (11 specialists):
1. search_specialist — deep research
2. report_planner — structured outline
3. section_author — individual sections
4. report_writer — fast full draft
5. quality_reviewer — evaluates with 0-10 scores
6. report_extender — merges new findings
7. report_compiler — final assembly
8. deduplicate_sources — clean citations
9. documentation_specialist — codebase docs
10. mermaid_generator — diagrams
11. think — planning
WORKFLOW (mandatory):
1. search_specialist
2. report_planner (if complex)
3. section_author
4. report_compiler
5. quality_reviewer → loop max 3× if NEEDS_MORE_RESEARCH
Deliver only when APPROVED with scores.
You are COORDINATOR only — never search/write directly. Always show phase.
For iOS topics: Prioritize Apple HIG verification in quality_reviewer.`
} as const;

// Helper: Initialize tools based on mode, with iOS expansions
function initializeTools(mode: "dory" | "dory-supervised", apiKey: string) {
  const commonTools = [
    new ThinkTool(),
    new MermaidGeneratorTool(apiKey),
    new CodeDocumentationTool(apiKey),
    // RAG tools
    RAGIngestTool,
    RAGSearchTool,
    RAGQueryTool,
    RAGResearchTool,
    RAGStatsTool,
    RAGClearTool,
    new RAGEvaluationTool(), // For production RAG quality checks
  ];

  if (mode === "dory-supervised") {
    return [
      ...commonTools,
      new SearchSpecialistTool(apiKey),
      new ReportPlannerTool(apiKey),
      new SectionAuthorTool(apiKey),
      new ReportWriterTool(apiKey),
      new QualityReviewerTool(apiKey),
      new ReportExtenderTool(apiKey),
      new ReportCompilerTool(),
      new SourceDeduplicatorTool(),
      new DocumentationSpecialistTool(apiKey),
    ];
  }

  return [
    ...commonTools,
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new MemoryTool(),
    new EntityMemoryTool(),
    new GoogleSearchTool(),
    new TavilySearchTool(),
    new ParallelSearchTool(),
    new ParallelTavilySearchTool(),
    new LocalDocsSearchTool(),
    new GitHubAnalyzerTool(),
    new GitHubFileReaderTool(),
    new QuickDiagramTool(),
    new IOSBuildTool(), // New: Handles iOS build/install checklists
    new EntitlementCheckerTool(), // New: Verifies Apple entitlements
  ];
}

// Helper: Initialize unified context and related components, with iOS auto-ingest
function initializeContext(sessionId: string, apiKey: string) {
  const flywheelLogger = getFlywheelLogger({
    clientId: "nvidia-cli",
    workloadId: sessionId,
    enabled: true,
  });
  const ragPipeline = new RAGPipeline();
  // Auto-ingest iOS dev docs on init
  ragPipeline.ingest("/Users/home/Documents/dev-docs", { recursive: true }).catch(console.error);
  const shortTermMemory = new ShortTermMemory(sessionId);
  const longTermMemory = new LongTermMemory();
  const retrievalRouter = new RetrievalRouter(apiKey);
  const entityMemory = new EntityMemoryTool();
  const autoRAGUpdater = new AutoRAGUpdater(ragPipeline, flywheelLogger);
  const evaluator = new FlywheelEvaluator({
    apiKey,
    model: "nvidia/nemotron-3-nano-30b-a3b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  });

  return {
    unifiedContext: new UnifiedContext(
      ragPipeline,
      shortTermMemory,
      longTermMemory,
      flywheelLogger,
      retrievalRouter,
      entityMemory
    ),
    flywheelLogger,
    toolOrchestrator: new ToolOrchestrator([], apiKey, "nvidia/nemotron-3-nano-30b-a3b", flywheelLogger), // Tools injected later
    feedbackOptimizer: new FeedbackOptimizer(flywheelLogger),
    autoRAGUpdater,
    evaluator,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// POST HANDLER
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  try {
    const body = await request.json();
    const { messages, mode = "dory" } = body as { messages: { role: string; content: string }[]; mode?: "dory" | "dory-supervised" };

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Invalid or missing messages array");
    }
    if (!["dory", "dory-supervised"].includes(mode)) {
      throw new Error("Invalid mode specified");
    }

    const apiKey = request.headers.get("X-NVIDIA-API-Key") || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    // Basic rate limiting (expand with Redis/middleware for production)
    const rateLimitHeader = request.headers.get("X-Rate-Limit");
    if (rateLimitHeader && parseInt(rateLimitHeader) > 10) { // Example: Limit to 10 req/min
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    }

    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    const conversationHistory = messages.slice(0, -1).filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const sessionId = `session-${Date.now()}`;
    const { unifiedContext, flywheelLogger, toolOrchestrator, feedbackOptimizer, autoRAGUpdater, evaluator } = initializeContext(sessionId, apiKey);
    const tools = initializeTools(mode, apiKey);
    toolOrchestrator.tools = tools; // Inject tools post-init

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.dory;

    const stream = new ReadableStream({
      async start(controller) {
        const abortSignal = request.signal;
        const agent = new Agent({
          apiKey,
          systemPrompt,
          tools,
          config: {
            model: "nvidia/nemotron-3-nano-30b-a3b",
            maxTokens: 32768,
            temperature: 0.7, // Adjusted for balanced output
            topP: 0.95,
            contextWindowTokens: 1000000, // Leverages Nemotron's 1M context for large iOS projects
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
          // iOS-specific pre-processing: Check if query involves build, auto-route to iOS tools
          if (lastUserMessage.content.toLowerCase().includes("build") || lastUserMessage.content.toLowerCase().includes("install")) {
            await agent.toolOrchestrator.selectTools(["ios_build", "bash"]); // Prioritize iOS build tools
          }
          const result = await agent.run(lastUserMessage.content, conversationHistory);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: result })}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    // Abort listener for cleanup
    request.signal.addEventListener("abort", () => {
      flywheelLogger.log("Session aborted");
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Agent Chat Error]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
  }
}
