// Terminal API Route
// WebSocket bridge for xterm.js using node-pty
// Note: This requires a custom server setup for WebSocket support
// For now, this provides a REST endpoint for command execution

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple command execution endpoint
// For full terminal support, use the WebSocket server in /lib/terminal-server.ts
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { command, cwd } = body as {
      command: string;
      cwd?: string;
    };

    if (!command) {
      return new Response(JSON.stringify({ error: "command is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10,
    });

    return new Response(
      JSON.stringify({ stdout, stderr }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number };
    return new Response(
      JSON.stringify({
        error: execError.message,
        stdout: execError.stdout,
        stderr: execError.stderr,
        code: execError.code,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
