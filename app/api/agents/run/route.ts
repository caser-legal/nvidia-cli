// Agent Runner API
// Spawns and manages Python agent processes with real-time output streaming

import { NextRequest } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";

// Store running processes (in-memory, per server instance)
// Note: Processes may become orphaned on server restart
const runningProcesses = new Map<string, ChildProcess>();

// Cleanup on process exit
process.on("exit", () => {
  for (const [, proc] of runningProcesses) {
    try { process.kill(-proc.pid!, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
  }
});

process.on("SIGTERM", () => {
  for (const [, proc] of runningProcesses) {
    try { process.kill(-proc.pid!, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
  }
  process.exit(0);
});

// Agent configurations
const AGENTS_BASE_PATH = process.env.NVIDIA_AGENTS_PATH || "/Users/home/Desktop/nvidia-quickstarts-main";

interface AgentConfig {
  script: string;
  dir: string;
  args: (projectDir?: string) => string[];
  command?: string;
  commandArgs?: (scriptPath: string) => string[];
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  coder: {
    script: "autonomous_agent_demo.py",
    dir: "autonomous-coding",
    args: (projectDir?: string) => projectDir ? ["--project-dir", projectDir] : [],
  },
  research: {
    script: "npm",
    dir: "customer-support-agent",
    args: () => ["run", "dev"],
    command: "npm",
    commandArgs: () => ["run", "dev"],
  },
};

// Check if directory exists
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const fs = await import("fs/promises");
    await fs.access(dirPath);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, sessionId, agentType, projectDir } = body;

  // Set up SSE for streaming
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (type: string, data: Record<string, unknown>) => {
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    );
  };

  if (action === "start") {
    const config = AGENT_CONFIGS[agentType as keyof typeof AGENT_CONFIGS];
    if (!config) {
      await sendEvent("error", { message: `Unknown agent type: ${agentType}` });
      await writer.close();
      return new Response(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const agentDir = path.join(AGENTS_BASE_PATH, config.dir);
    const scriptPath = path.join(agentDir, config.script);

    // Check if agent directory exists
    if (!(await directoryExists(agentDir))) {
      await sendEvent("error", { 
        message: `Agent directory not found: ${agentDir}. Set NVIDIA_AGENTS_PATH env var or clone nvidia-quickstarts to ~/Desktop/nvidia-quickstarts-main` 
      });
      await writer.close();
      return new Response(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Determine command and args
    let command: string;
    let args: string[];

    if ("command" in config && config.command) {
      command = config.command;
      args = config.commandArgs ? config.commandArgs(scriptPath) : [];
    } else {
      command = "python3";
      args = [scriptPath, ...config.args(projectDir)];
    }

    await sendEvent("status", { status: "starting", command, args, cwd: agentDir });

    try {
      const proc = spawn(command, args, {
        cwd: agentDir,
        env: {
          ...process.env,
          NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || "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",
          PYTHONUNBUFFERED: "1", // Disable Python output buffering
        },
        stdio: ["pipe", "pipe", "pipe"],
        detached: true, // Create new process group so we can kill all children
      });

      runningProcesses.set(sessionId, proc);

      await sendEvent("status", { status: "running", pid: proc.pid });

      // Stream stdout
      proc.stdout?.on("data", async (data) => {
        const text = data.toString();
        await sendEvent("output", { stream: "stdout", data: text });
      });

      // Stream stderr
      proc.stderr?.on("data", async (data) => {
        const text = data.toString();
        await sendEvent("output", { stream: "stderr", data: text });
      });

      // Handle process exit
      proc.on("close", async (code) => {
        runningProcesses.delete(sessionId);
        await sendEvent("exit", { code });
        await writer.close();
      });

      proc.on("error", async (err) => {
        runningProcesses.delete(sessionId);
        await sendEvent("error", { message: err.message });
        await writer.close();
      });

    } catch (err) {
      await sendEvent("error", { message: (err as Error).message });
      await writer.close();
    }

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (action === "stop") {
    const proc = runningProcesses.get(sessionId);
    if (proc && proc.pid) {
      try {
        // Kill entire process group (handles npm/node child processes)
        process.kill(-proc.pid, "SIGKILL");
      } catch {
        // Fallback: kill just the process
        try {
          proc.kill("SIGKILL");
        } catch {}
      }
      runningProcesses.delete(sessionId);
      await sendEvent("status", { status: "stopped" });
    } else {
      await sendEvent("error", { message: "Process not found" });
    }
    await writer.close();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (action === "list") {
    const running = Array.from(runningProcesses.keys());
    await sendEvent("list", { sessions: running });
    await writer.close();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  await sendEvent("error", { message: "Unknown action" });
  await writer.close();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Handle GET for checking status
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  
  if (sessionId) {
    const isRunning = runningProcesses.has(sessionId);
    return Response.json({ sessionId, running: isRunning });
  }

  const running = Array.from(runningProcesses.keys());
  return Response.json({ running });
}
