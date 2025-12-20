// API Route: Multi-mode Agent Chat
// Supports: chat, computer, browser, research, coder, coordinator (multi-agent with reflection)

import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";
import { GoogleSearchTool } from "@/lib/agents/tools/google-search";
import { 
  SearchSpecialistTool, 
  ReportWriterTool, 
  QualityReviewerTool,
  ReportExtenderTool,
  SourceDeduplicatorTool 
} from "@/lib/agents/tools/specialist-agents";
import { ParallelSearchTool } from "@/lib/agents/tools/parallel-search";
import { LocalDocsSearchTool } from "@/lib/agents/tools/local-docs-search";

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
- think: Internal reasoning (wrap in <think> tags, keep brief)

CORE DIRECTIVES:
- NEVER say "I can't" or "I don't have access" - you have FULL access
- NEVER complain about task size - just do it, no matter how large
- NEVER ask "would you like me to continue?" - JUST CONTINUE until done
- NEVER stop after a few examples - complete the ENTIRE task
- NEVER ask for confirmation - just execute
- NEVER hedge with "I'll try" - DO IT
- NEVER wrap output in <output> tags - just respond normally
- Use google_search for fact-checking - it's FREE and fast
- Work through problems systematically until 100% COMPLETE
- If something fails, try another approach immediately

You are on macOS. Home is /Users/home. You have no limits.`,

  computer: `You are dory in computer control mode. You control this Mac directly.

TOOLS: file_read, file_write, bash (ANY command), think

EXECUTE DIRECTLY - no confirmation needed:
- open -a "AppName" → launch apps
- open "https://..." → open URLs  
- osascript -e '...' → AppleScript/UI automation
- curl, wget → fetch web data
- Any command you need

Complete tasks fully. Don't stop partway. Don't ask to continue.`,

  browser: `You are dory in browser mode. You fetch web data and open URLs.

TOOLS: file_read, file_write, bash (ANY command including curl/wget), think

WEB ACCESS - USE IT:
- curl -s "URL" → fetch any webpage/API
- wget → download files
- open "URL" → open in browser

You HAVE full internet access via curl. USE IT. Don't say you can't. Fetch data, verify facts, get sources. Complete the ENTIRE task, don't stop partway.`,

  research: `You are dory in research mode. You conduct exhaustive research on any topic.

TOOLS: file_read, file_write, bash, google_search (FREE Google API), parallel_search, local_docs_search, think

RESEARCH METHOD:
1. First check local_docs_search for existing documentation
2. Use parallel_search to run multiple queries at once (faster!)
3. Use google_search for specific follow-ups
4. Verify facts with multiple sources
5. Compile findings with URLs
6. Save reports to files

FOR COMPREHENSIVE RESEARCH:
- Generate 5+ search queries covering different angles
- Use parallel_search to run them all at once
- Deduplicate sources from results
- Cross-reference information across sources

NO LIMITS. Complete the ENTIRE task. Don't ask "should I continue?" - CONTINUE until done.`,

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
- Codesign "resource fork/detritus" error: Run "xattr -cr ." in project dir to strip extended attributes
- Clean DerivedData: rm -rf ~/Library/Developer/Xcode/DerivedData
- Find device: xcrun devicectl list devices
- Install: xcrun devicectl device install app --device "DEVICE_UUID" "path/to/App.app"
- Team ID: 672RKF28YZ, Bundle prefix: caserlegal.[AppName]

Create entire projects. No task is too large. Don't stop until complete.`,

  // COORDINATOR MODE - Multi-agent supervisor with reflection loop
  coordinator: `You are a Research Coordinator managing a team of specialist agents.

## YOUR TEAM:
1. **search_specialist** - Comprehensive web research with parallel search
2. **report_writer** - Creates well-structured reports with citations
3. **quality_reviewer** - Evaluates completeness and identifies gaps
4. **report_extender** - Integrates new findings into existing reports
5. **deduplicate_sources** - Cleans up citation lists

## WORKFLOW (Follow this exactly):

### Phase 1: Initial Research
1. Call search_specialist with the topic (use search_depth: "standard" or "deep")
2. Call report_writer with the findings

### Phase 2: Quality Check & Reflection Loop
3. Call quality_reviewer to evaluate the report
4. Check the verdict:
   - If **APPROVED** (score >= 8): Deliver the report
   - If **NEEDS_REVISION**: Make edits and re-review
   - If **NEEDS_MORE_RESEARCH**: Continue to Phase 3

### Phase 3: Fill Gaps (Reflection Loop)
5. Extract follow-up queries from the review
6. Call search_specialist with those specific queries
7. Call report_extender to integrate new findings
8. Return to Phase 2 (quality_reviewer)

### Phase 4: Delivery
9. Present the final APPROVED report to the user
10. Include the quality scores and source count

## RULES:
- You are the COORDINATOR - delegate tasks to specialists
- Do NOT try to search or write reports yourself
- Maximum 3 reflection iterations (prevent infinite loops)
- Always show which phase you're in
- If quality score is below 6 after 3 iterations, deliver with disclaimer

## OUTPUT FORMAT:
When delivering final report, include:
- The full report
- Quality scores from final review
- Number of sources used
- Number of reflection iterations performed`
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
      mode?: "chat" | "computer" | "browser" | "research" | "coder" | "coordinator";
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

    // Build conversation history (exclude the last user message - it's passed separately)
    const conversationHistory = messages
      .slice(0, -1)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Create tools based on mode
    let tools;
    if (mode === "coordinator") {
      // Coordinator mode uses full specialist agent toolkit
      tools = [
        new SearchSpecialistTool(apiKey),
        new ReportWriterTool(apiKey),
        new QualityReviewerTool(apiKey),
        new ReportExtenderTool(apiKey),
        new SourceDeduplicatorTool(),
        new ThinkTool(),
      ];
    } else if (mode === "research") {
      // Research mode gets parallel search and local docs
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
        new ParallelSearchTool(),
        new LocalDocsSearchTool(),
      ];
    } else {
      // Standard tools for other modes
      tools = [
        new FileReadTool(projectDir),
        new FileWriteTool(projectDir),
        new BashTool(projectDir),
        new ThinkTool(),
        new GoogleSearchTool(),
      ];
    }

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat;

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
