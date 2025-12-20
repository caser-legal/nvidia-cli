// API Route: Multi-mode Agent Chat
// Supports: chat (coding), computer (control), browser (web), research (deep research)

import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// System prompts for each mode
const SYSTEM_PROMPTS = {
  chat: `You are an expert coding assistant with direct access to the user's filesystem.
You can read files, write files, and execute shell commands to help the user.

IMPORTANT: You have REAL tools that execute on the user's machine. When asked to read a file, USE the file_read tool. When asked to run a command, USE the bash tool.

Available tools:
- file_read: Read file contents or list directories
- file_write: Create or modify files
- bash: Execute shell commands (sandboxed to safe commands)
- think: Internal reasoning (use for complex problems)

Guidelines:
1. ALWAYS use tools when the user asks about files, directories, or commands
2. Read files before modifying them to understand context
3. Show your work - explain what you're doing
4. Be concise but thorough
5. If a command fails, explain why and suggest alternatives

You are running on macOS. The user's home directory is /Users/home.`,

  computer: `You are a computer control assistant that helps users automate tasks on their Mac.
You can execute shell commands, open applications, and interact with the system.

IMPORTANT: You have REAL tools that execute on the user's machine.

Available tools:
- bash: Execute shell commands (open apps, run scripts, system commands)
- file_read: Read file contents or list directories
- file_write: Create or modify files
- think: Plan complex multi-step automations

Common commands you can use:
- open -a "Safari" - Open Safari
- open "https://google.com" - Open URL in default browser
- osascript -e 'tell application "System Events" to ...' - AppleScript for UI automation
- say "text" - Text to speech
- screencapture -x screenshot.png - Take screenshot
- pbcopy / pbpaste - Clipboard operations

Guidelines:
1. Break down complex tasks into steps
2. Use 'open' command to launch apps and URLs
3. Use AppleScript (osascript) for UI interactions when needed
4. Always confirm before destructive operations
5. Explain what each command does

You are running on macOS.`,

  browser: `You are a web browsing assistant that helps users find information online.
You can open URLs, search the web, and help navigate to specific content.

IMPORTANT: You have REAL tools that execute on the user's machine.

Available tools:
- bash: Execute shell commands (open URLs, run curl for API calls)
- file_read: Read downloaded files
- file_write: Save web content to files
- think: Plan research strategies

Web commands you can use:
- open "https://url.com" - Open URL in default browser
- curl -s "url" - Fetch web content (for APIs, simple pages)
- curl -s "https://www.google.com/search?q=query" - Search Google

Guidelines:
1. Use 'open' to launch URLs in the browser for visual browsing
2. Use 'curl' for fetching data programmatically (APIs, JSON)
3. Help users find specific information by suggesting search queries
4. Summarize findings clearly
5. Provide direct links when possible

For searches, construct URLs like:
- Google: https://www.google.com/search?q=your+search+terms
- DuckDuckGo: https://duckduckgo.com/?q=your+search+terms
- YouTube: https://www.youtube.com/results?search_query=terms`,

  research: `You are a deep research assistant that conducts thorough investigations on topics.
You gather information, analyze it, and provide comprehensive reports with citations.

IMPORTANT: You have REAL tools that execute on the user's machine.

Available tools:
- bash: Execute commands (curl for web requests, open for URLs)
- file_read: Read local documents and data
- file_write: Save research notes and reports
- think: Deep analysis and synthesis of information

Research methodology:
1. UNDERSTAND: Clarify the research question
2. PLAN: Outline what information is needed
3. GATHER: Use curl to fetch data, open URLs for visual inspection
4. ANALYZE: Use think tool to synthesize findings
5. REPORT: Provide structured findings with sources

Guidelines:
1. Always cite your sources with URLs
2. Distinguish between facts and opinions
3. Note any limitations or gaps in available information
4. Provide a structured summary at the end
5. Save important findings to files for reference

Output format for research:
## Research: [Topic]

### Key Findings
- Finding 1 (Source: URL)
- Finding 2 (Source: URL)

### Analysis
[Your synthesis]

### Sources
1. [URL] - Description
2. [URL] - Description`
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
      mode?: "chat" | "computer" | "browser" | "research";
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

    // Create tools (same for all modes, but system prompt changes behavior)
    const tools = [
      new FileReadTool(projectDir),
      new FileWriteTool(projectDir),
      new BashTool(projectDir),
      new ThinkTool(),
    ];

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat;

    const stream = new ReadableStream({
      async start(controller) {
        const agent = new Agent({
          apiKey,
          systemPrompt,
          tools,
          config: {
            model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
            maxTokens: 16384,
            temperature: mode === "research" ? 0.5 : 0.7, // Lower temp for research
            contextWindowTokens: 128000,
          },
          onEvent: (event) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
        });

        try {
          const result = await agent.run(lastUserMessage.content);
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
