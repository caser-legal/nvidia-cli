// CLI Chat Component
// Terminal-like interface for the agentic chat with color-coded tool execution

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { FolderOpen } from "lucide-react";
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
  onProjectDirChange?: (dir: string) => void;
  className?: string;
}

export function CLIChat({ projectDir = "/Users/home", onProjectDirChange, className }: CLIChatProps) {
  const [currentDir, setCurrentDir] = React.useState(projectDir);
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

  const handleFolderSelect = () => {
    const newDir = prompt("Enter project directory path:", currentDir);
    if (newDir && newDir.trim()) {
      setCurrentDir(newDir.trim());
      onProjectDirChange?.(newDir.trim());
      setEvents(prev => [...prev, { 
        type: "status", 
        status: `switched to ${newDir.trim()}` 
      }]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    const userMessage = input.trim();
    setInput("");
    setIsRunning(true);

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
          projectDir: currentDir,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

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

  const formatContent = (content: string) => {
    // Convert <think> tags to blockquotes for visibility
    return content.replace(/<think>([\s\S]*?)<\/think>/g, "\n> **Thinking:**\n> $1\n").trim();
  };

  const renderEvent = (event: AgentEvent, index: number) => {
    switch (event.type) {
      case "message":
        if (event.role === "user") {
          return (
            <div key={index} className="flex items-start gap-2 py-1">
              <span className="text-cyan-400 font-mono shrink-0">[user]</span>
              <span className="text-white whitespace-pre-wrap break-words min-w-0 flex-1">{event.content}</span>
            </div>
          );
        }
        const formattedContent = formatContent(event.content || "");
        if (!formattedContent) return null;
        return (
          <div key={index} className="flex items-start gap-2 py-2">
            <span className="text-green-400 font-mono shrink-0">[dory]</span>
            <div className="text-gray-200 flex-1 min-w-0 prose prose-invert prose-sm max-w-none break-words prose-pre:bg-gray-800 prose-pre:text-gray-200 prose-code:text-green-400 prose-headings:text-white prose-strong:text-white prose-li:text-gray-200 prose-blockquote:text-gray-500 prose-blockquote:border-l-gray-600">
              <ReactMarkdown>{formattedContent}</ReactMarkdown>
            </div>
          </div>
        );

      case "tool_call":
        return (
          <div key={index} className="flex items-start gap-2 py-1 font-mono text-sm">
            <span className="text-yellow-400">⚡</span>
            <span className="text-yellow-400">{event.name}</span>
            <span className="text-gray-500 break-all whitespace-pre-wrap min-w-0 flex-1">({event.args})</span>
          </div>
        );

      case "tool_result":
        const isError = event.is_error;
        const resultText = event.result || "";
        
        return (
          <div key={index} className="py-1 pl-4 border-l-2 border-gray-700 ml-4 text-xs overflow-hidden">
            <div className={cn(
              "font-mono whitespace-pre-wrap break-words",
              isError ? "text-red-400" : "text-gray-500"
            )}>
              {resultText}
            </div>
          </div>
        );

      case "status":
        return (
          <div key={index} className="flex items-center gap-2 py-1 text-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              event.status === "error" ? "bg-red-500" : "bg-green-500",
              event.status === "running" && "animate-pulse"
            )} />
            <span className={cn(
              "font-mono text-white",
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
        return null;

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
        <button
          onClick={handleFolderSelect}
          className="flex items-center gap-2 ml-2 px-2 py-1 rounded hover:bg-gray-700 transition-colors group"
          title="Change project directory"
        >
          <FolderOpen className="h-4 w-4 text-gray-400 group-hover:text-[#76B900]" />
          <span className="text-gray-400 text-sm truncate max-w-[300px] group-hover:text-white">
            {currentDir}
          </span>
        </button>
        {isRunning && (
          <span className="ml-auto text-green-400 text-sm animate-pulse">● running</span>
        )}
      </div>

      {/* Output area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {events.length === 0 && (
            <div className="text-gray-500">
              <div className="text-green-400 mb-2">NVIDIA CLI [codename: dory]</div>
              <div>Welcome to the future of software development:</div>
              <div className="pl-4 text-gray-600">
                • Truly autonomous task execution<br />
                • Never say "just do it" again<br />
                • Starts and finishes on its own<br />
                • Build entire apps with one file
              </div>
              <div className="mt-2 text-gray-400">Click the folder icon above to select a project, then type below.</div>
            </div>
          )}

          {events.map((event, i) => renderEvent(event, i))}

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
