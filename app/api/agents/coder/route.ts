// Coding Agent API Route
// Autonomous coding agent with streaming updates

import { Agent, FileReadTool, FileWriteTool, BashTool, ThinkTool } from "@/lib/agents";
import type { AgentEvent } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODING_SYSTEM_PROMPT = `You are an expert full-stack developer building a production-quality web application.

Your workflow:
1. Read the feature_list.json to see what features need to be implemented
2. Pick the first failing feature (passes: false)
3. Implement the feature by reading/writing files
4. Test by running appropriate commands
5. Mark the feature as passing in feature_list.json
6. Report your progress

Available tools:
- file_read: Read files or list directories
- file_write: Write or edit files
- bash: Execute shell commands (npm, git, etc.)
- think: Plan your approach before acting

Always verify your changes work before marking features as passing.
Focus on one feature at a time. Be thorough but efficient.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectDir, message, stream = true } = body as {
      projectDir: string;
      message: string;
      stream?: boolean;
    };

    if (!projectDir) {
      return new Response(JSON.stringify({ error: "projectDir is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create tools scoped to project directory
    const tools = [
      new FileReadTool(projectDir),
      new FileWriteTool(projectDir),
      new BashTool(projectDir),
      new ThinkTool(),
    ];

    const agent = new Agent({
      systemPrompt: CODING_SYSTEM_PROMPT,
      tools,
      config: {
        model: "nvidia/nemotron-3-nano",
        maxTokens: 16384,
        temperature: 0.7,
      },
    });

    if (stream) {
      const encoder = new TextEncoder();
      
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of agent.runStream(message)) {
              const data = JSON.stringify(event);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const errorEvent: AgentEvent = {
              type: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } else {
      const result = await agent.run(message);
      return new Response(JSON.stringify({ result, history: agent.getHistory() }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Coding agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
