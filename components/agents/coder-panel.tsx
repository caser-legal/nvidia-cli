// Coder Agent Panel
// Shows autonomous coding agent progress and output

"use client";

import * as React from "react";
import { Play, Pause, Square, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/lib/agents/types";

interface CoderPanelProps {
  projectDir: string;
  onClose?: () => void;
}

interface LogEntry {
  id: string;
  type: AgentEvent["type"];
  content: string;
  timestamp: Date;
  isError?: boolean;
}

export function CoderPanel({ projectDir, onClose }: CoderPanelProps) {
  const [status, setStatus] = React.useState<"idle" | "running" | "paused" | "completed" | "error">("idle");
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [progress, setProgress] = React.useState({ passing: 0, total: 0 });
  const [iteration, setIteration] = React.useState(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const addLog = (type: AgentEvent["type"], content: string, isError?: boolean) => {
    const now = new Date();
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, type, content, timestamp: now, isError },
    ]);
  };

  const startAgent = async () => {
    setStatus("running");
    setLogs([]);
    abortRef.current = new AbortController();

    addLog("status", "Starting autonomous coding agent...");

    try {
      const response = await fetch("/api/agents/coder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectDir,
          message: "Read feature_list.json and implement the first failing feature. After implementing, verify it works and mark it as passing.",
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data) as AgentEvent;
              handleEvent(event);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        addLog("error", `Error: ${(error as Error).message}`, true);
        setStatus("error");
      }
    }
  };

  const handleEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "status":
        setStatus(event.status);
        addLog("status", `Status: ${event.status}`);
        break;
      case "message":
        addLog("message", `[${event.role}] ${event.content}`);
        break;
      case "tool_call":
        addLog("tool_call", `🔧 ${event.name}(${event.args.slice(0, 100)}...)`);
        break;
      case "tool_result":
        addLog("tool_result", `✓ ${event.name}: ${event.result.slice(0, 200)}`, event.is_error);
        break;
      case "iteration":
        setIteration(event.number);
        addLog("iteration", `--- Iteration ${event.number} ---`);
        break;
      case "progress":
        setProgress({ passing: event.passing, total: event.total });
        addLog("progress", `Progress: ${event.passing}/${event.total} features passing`);
        break;
      case "error":
        addLog("error", event.message, true);
        break;
      case "complete":
        addLog("complete", `✅ ${event.summary}`);
        break;
    }
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setStatus("paused");
    addLog("status", "Agent stopped by user");
  };

  // Auto-scroll to bottom
  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const progressPercent = progress.total > 0 ? (progress.passing / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-semibold">Autonomous Coder</h3>
          <p className="text-xs text-muted-foreground">{projectDir}</p>
        </div>
        <div className="flex items-center gap-2">
          {status === "running" ? (
            <Button variant="destructive" size="sm" onClick={stopAgent}>
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={startAgent}>
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="p-4 border-b space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Progress</span>
          <span className="font-mono">
            {progress.passing}/{progress.total} ({progressPercent.toFixed(0)}%)
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Iteration: {iteration}</span>
          <span className="flex items-center gap-1">
            {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === "completed" && <CheckCircle className="h-3 w-3 text-green-500" />}
            {status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
            {status}
          </span>
        </div>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1 font-mono text-xs">
          {logs.map((log) => (
            <div
              key={log.id}
              className={cn(
                "py-1 px-2 rounded",
                log.isError && "bg-red-500/10 text-red-500",
                log.type === "tool_call" && "bg-blue-500/10 text-blue-500",
                log.type === "tool_result" && "bg-green-500/10",
                log.type === "complete" && "bg-green-500/20 text-green-500 font-semibold"
              )}
            >
              <span className="text-muted-foreground">
                {log.timestamp.toLocaleTimeString()}
              </span>{" "}
              {log.content}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
