// API Route: Agentic Chat with Real Tool Execution
// This is the CLI-like coding agent that actually runs commands

import { Agent } from "@/lib/agents/agent";
import { FileReadTool } from "@/lib/agents/tools/file-read";
import { FileWriteTool } from "@/lib/agents/tools/file-write";
import { BashTool } from "@/lib/agents/tools/bash";
import { ThinkTool } from "@/lib/agents/tools/think";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for long-running agent tasks

const AGENT_SYSTEM_PROMPT = `You are an expert coding assistant with direct access to the user's filesystem.
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

You are running on macOS. The user's home directory is /Users/home.`;

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  
  try {
    const body = await request.json();
    const { messages, projectDir = "/Users/home" } = body as {
      messages: { role: string; content: string }[];
      projectDir?: string;
    };

    const apiKey = request.headers.get("X-NVIDIA-API-Key") || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create tools
    const tools = [
      new FileReadTool(projectDir),
      new FileWriteTool(projectDir),
      new BashTool(projectDir),
      new ThinkTool(),
    ];

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const agent = new Agent({
          apiKey,
          systemPrompt: AGENT_SYSTEM_PROMPT,
          tools,
          config: {
            model: "nvidia/llama-3.3-nemotron-super-49b-v1.5", // Best for agentic tasks
            maxTokens: 16384,
            temperature: 0.7,
            contextWindowTokens: 128000,
          },
          onEvent: (event) => {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          },
        });

        try {
          // Run the agent
          const result = await agent.run(lastUserMessage.content);
          
          // Send final result
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
