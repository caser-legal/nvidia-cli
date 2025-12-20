// CLI Chat Component
// Terminal-like interface for the agentic chat with color-coded tool execution

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
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
              // Skip user messages from server - we already added it locally
              if (event.type === "message" && event.role === "user") continue;
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

  // Strip <think>...</think> tags from content
  const stripThinking = (content: string) => {
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  };

  const renderEvent = (event: AgentEvent, index: number) => {
    switch (event.type) {
      case "message":
        if (event.role === "user") {
          return (
            <div key={index} className="flex items-start gap-2 py-1">
              <span className="text-cyan-400 font-mono shrink-0">[user]</span>
              <span className="text-white">{event.content}</span>
            </div>
          );
        }
        // Assistant message - render markdown, strip thinking
        const cleanContent = stripThinking(event.content || "");
        if (!cleanContent) return null;
        return (
          <div key={index} className="flex items-start gap-2 py-2">
            <span className="text-green-400 font-mono shrink-0">[dory]</span>
            <div className="text-gray-200 flex-1 prose prose-invert prose-sm max-w-none prose-pre:bg-gray-800 prose-pre:text-gray-200 prose-code:text-green-400 prose-headings:text-white prose-strong:text-white prose-li:text-gray-200">
              <ReactMarkdown>{cleanContent}</ReactMarkdown>
            </div>
          </div>
        );

      case "tool_call":
        return (
          <div key={index} className="flex items-start gap-2 py-1 font-mono text-sm">
            <span className="text-yellow-400">⚡</span>
            <span className="text-yellow-400">{event.name}</span>
            <span className="text-gray-500 truncate max-w-[500px]">({event.args})</span>
          </div>
        );

      case "tool_result":
        const isError = event.is_error;
        const resultLines = (event.result || "").split("\n");
        const truncated = resultLines.length > 10;
        const displayLines = truncated ? resultLines.slice(0, 10) : resultLines;
        
        return (
          <div key={index} className="py-1 pl-4 border-l-2 border-gray-700 ml-4 text-xs">
            <div className={cn(
              "font-mono whitespace-pre-wrap",
              isError ? "text-red-400" : "text-gray-500"
            )}>
              {displayLines.join("\n")}
              {truncated && (
                <div className="text-gray-600 italic">... ({resultLines.length - 10} more lines)</div>
              )}
            </div>
          </div>
        );

      case "status":
        return (
          <div key={index} className="flex items-center gap-2 py-1 text-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              event.status === "running" && "bg-yellow-500 animate-pulse",
              event.status === "completed" && "bg-green-500",
              event.status === "error" && "bg-red-500"
            )} />
            <span className={cn(
              "font-mono",
              event.status === "running" && "text-yellow-500",
              event.status === "completed" && "text-white",
              event.status === "error" && "text-red-500"
            )}>{event.status}</span>
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
              <div className="text-green-400 mb-2">NVIDA CLI [codename: dory]</div>
              <div>Welcome to the future of software development:</div>
              <div className="pl-4 text-gray-600">
                • Truly autonomous task execution<br />
                • Never say "just do it" again<br />
                • Starts and finishes on its own<br />
                • Build entire apps with one file
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
