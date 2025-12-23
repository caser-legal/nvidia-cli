import { NextRequest } from "next/server";
import { spawn } from "child_process";

const LOG_FILE = "/tmp/nvidia-cli-dev.log";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lines = parseInt(url.searchParams.get("lines") || "100");
  const stream = url.searchParams.get("stream") === "true";

  if (stream) {
    // SSE stream using tail -f
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        let closed = false;
        const safeClose = () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch {}
          }
        };
        const safeEnqueue = (data: Uint8Array) => {
          if (!closed) {
            try { controller.enqueue(data); } catch {}
          }
        };

        const tail = spawn("tail", ["-f", "-n", String(lines), LOG_FILE]);

        tail.stdout.on("data", (data: Buffer) => {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ log: data.toString() })}\n\n`));
        });

        tail.stderr.on("data", (data: Buffer) => {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: data.toString() })}\n\n`));
        });

        tail.on("close", safeClose);

        req.signal.addEventListener("abort", () => {
          tail.kill();
          safeClose();
        });
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming: return last N lines
  const { execSync } = await import("child_process");
  try {
    const output = execSync(`tail -n ${lines} ${LOG_FILE}`, { encoding: "utf-8" });
    return Response.json({ logs: output });
  } catch {
    return Response.json({ logs: "", error: "Log file not found" });
  }
}
