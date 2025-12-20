// CLI Chat Component
// Terminal-like interface for the agentic chat with color-coded tool execution

"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AgentEvent {
  type: "status" | "message" | "tool_call" | "tool_result" | "iteration" | "progress" | "error" | "complete" | "done";
  status?: string;
  role?: string;
  content?: string;
  name?: string;
  args?: string;
  result?: string;
  is_error?: boolean;
  message?: string;
  number?: number;
  passing?: number;
  total?: number;
  summary?: string;
}

interface CLIChatProps {
  projectDir?: string;
  className?: string;
}

export function CLIChat({ projectDir = "/Users/home", className }: CLIChatProps) {
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [input, setInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Focus input on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    const userMessage = input.trim();
    setInput("");
    setIsRunning(true);

    // Add user message to events
    setEvents(prev => [...prev, { type: "message", role: "user", content: userMessage }]);

    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.NEXT_PUBLIC_NVIDIA_API_KEY && {
            "X-NVIDIA-API-Key": process.env.NEXT_PUBLIC_NVIDIA_API_KEY,
          }),
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: userMessage }],
          projectDir,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as AgentEvent;
              setEvents(prev => [...prev, event]);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      setEvents(prev => [...prev, {
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }]);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  };

  const renderEvent = (event: AgentEvent, index: number) => {
    switch (event.type) {
      case "message":
        if (event.role === "user") {
          return (
            <div key={index} className="flex items-start gap-2 py-1">
              <span className="text-cyan-400 font-mono">[user]</span>
              <span className="text-white">{event.content}</span>
            </div>
          );
        }
        // Assistant message - show as dory
        return (
          <div key={index} className="flex items-start gap-2 py-1">
            <span className="text-green-400 font-mono">[dory]</span>
            <span className="text-gray-300 whitespace-pre-wrap flex-1">{event.content}</span>
          </div>
        );

      case "tool_call":
        return (
          <div key={index} className="flex items-start gap-2 py-1 font-mono">
            <span className="text-yellow-400">⚡</span>
            <span className="text-yellow-400">{event.name}</span>
            <span className="text-gray-500">(</span>
            <span className="text-green-400 text-sm max-w-[600px] truncate">{event.args}</span>
            <span className="text-gray-500">)</span>
          </div>
        );

      case "tool_result":
        const isError = event.is_error;
        const resultLines = (event.result || "").split("\n");
        const truncated = resultLines.length > 20;
        const displayLines = truncated ? resultLines.slice(0, 20) : resultLines;
        
        return (
          <div key={index} className="py-1 pl-6 border-l-2 border-gray-700 ml-2">
            <div className={cn(
              "font-mono text-sm whitespace-pre-wrap",
              isError ? "text-red-400" : "text-gray-400"
            )}>
              {displayLines.join("\n")}
              {truncated && (
                <div className="text-gray-600 italic">... ({resultLines.length - 20} more lines)</div>
              )}
            </div>
          </div>
        );

      case "status":
        return (
          <div key={index} className="flex items-center gap-2 py-1 text-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              event.status === "running" && "bg-green-500 animate-pulse",
              event.status === "completed" && "bg-blue-500",
              event.status === "error" && "bg-red-500"
            )} />
            <span className="text-gray-500 font-mono">{event.status}</span>
          </div>
        );

      case "error":
        return (
          <div key={index} className="flex items-start gap-2 py-1 text-red-400">
            <span>❌</span>
            <span>{event.message}</span>
          </div>
        );

      case "complete":
      case "done":
        return null; // Don't render completion events

      default:
        return null;
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-[#1a1a1a] text-white font-mono", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-[#252525]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-gray-400 text-sm ml-2">dory — {projectDir}</span>
        {isRunning && (
          <span className="ml-auto text-green-400 text-sm animate-pulse">● running</span>
        )}
      </div>

      {/* Output area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {/* Welcome message */}
          {events.length === 0 && (
            <div className="text-gray-500">
              <div className="text-green-400 mb-2">dory 🐟 — autonomous coding assistant</div>
              <div>Welcome to the future of software development:</div>
              <div className="pl-4 text-gray-600">
                • Autonomous task execution<br />
                • File system access & shell commands<br />
                • Starts and finishes on its own<br />
                • Build entire features with one prompt
              </div>
              <div className="mt-2 text-gray-400">Type below to start working with dory.</div>
            </div>
          )}

          {/* Events */}
          {events.map((event, i) => renderEvent(event, i))}

          {/* Scroll anchor */}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-gray-800 p-4 bg-[#252525]">
        <div className="flex items-center gap-2">
          <span className="text-green-400">❯</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning}
            placeholder={isRunning ? "dory is thinking..." : "Ask dory anything..."}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </form>
    </div>
  );
}
