// Agent Chat Component
// Reusable terminal-like interface for all agent modes

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Monitor, Globe, Headphones, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AgentEvent {
  type: "status" | "message" | "tool_call" | "tool_result" | "error" | "complete" | "done";
  status?: string;
  role?: string;
  content?: string;
  name?: string;
  args?: string;
  result?: string;
  is_error?: boolean;
  message?: string;
}

type AgentMode = "chat" | "computer" | "browser" | "research";

interface AgentChatProps {
  mode: AgentMode;
  className?: string;
}

const MODE_CONFIG = {
  chat: {
    name: "Talk",
    icon: MessageSquare,
    color: "text-green-400",
    bgColor: "bg-green-500",
    placeholder: "Ask dory anything...",
    welcome: {
      title: "NVIDIA CLI [codename: dory]",
      description: "Your AI coding assistant with real tool execution",
      features: [
        "Read and write files on your system",
        "Execute shell commands safely",
        "Build entire features autonomously",
      ],
    },
  },
  computer: {
    name: "Control",
    icon: Monitor,
    color: "text-purple-400",
    bgColor: "bg-purple-500",
    placeholder: "What would you like me to do on your computer?",
    welcome: {
      title: "Computer Control Mode",
      description: "I can control your Mac to automate tasks",
      features: [
        "Open applications and URLs",
        "Execute system commands",
        "Automate repetitive tasks",
        "Take screenshots and interact with UI",
      ],
    },
  },
  browser: {
    name: "Browse",
    icon: Globe,
    color: "text-orange-400",
    bgColor: "bg-orange-500",
    placeholder: "What would you like me to find online?",
    welcome: {
      title: "Web Browsing Mode",
      description: "I can help you find information on the web",
      features: [
        "Open websites and search engines",
        "Fetch data from APIs",
        "Search Google, DuckDuckGo, YouTube",
        "Save web content to files",
      ],
    },
  },
  research: {
    name: "Research",
    icon: Headphones,
    color: "text-pink-400",
    bgColor: "bg-pink-500",
    placeholder: "What topic would you like me to research?",
    welcome: {
      title: "Deep Research Mode",
      description: "I conduct thorough investigations with citations",
      features: [
        "Multi-source research methodology",
        "Structured reports with citations",
        "Analysis and synthesis of findings",
        "Save research notes to files",
      ],
    },
  },
};

export function AgentChat({ mode, className }: AgentChatProps) {
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [input, setInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear events when mode changes
  React.useEffect(() => {
    setEvents([]);
  }, [mode]);

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
          mode,
          projectDir: "/Users/home",
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
            } catch {}
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

  const stripThinking = (content: string) => {
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  };

  const renderEvent = (event: AgentEvent, index: number) => {
    switch (event.type) {
      case "message":
        if (event.role === "user") {
          return (
            <div key={index} className="flex items-start gap-2 py-1">
              <span className="text-cyan-400 font-mono shrink-0">[you]</span>
              <span className="text-white">{event.content}</span>
            </div>
          );
        }
        const cleanContent = stripThinking(event.content || "");
        if (!cleanContent) return null;
        return (
          <div key={index} className="flex items-start gap-2 py-2">
            <span className={cn("font-mono shrink-0", config.color)}>[dory]</span>
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
            <div className={cn("font-mono whitespace-pre-wrap", isError ? "text-red-400" : "text-gray-500")}>
              {displayLines.join("\n")}
              {truncated && <div className="text-gray-600 italic">... ({resultLines.length - 10} more lines)</div>}
            </div>
          </div>
        );

      case "status":
        return (
          <div key={index} className="flex items-center gap-2 py-1 text-sm">
            <span className={cn("w-2 h-2 rounded-full", event.status === "error" ? "bg-red-500" : config.bgColor, event.status === "running" && "animate-pulse")} />
            <span className={cn("font-mono", event.status === "error" ? "text-red-500" : "text-white")}>{event.status}</span>
          </div>
        );

      case "error":
        return (
          <div key={index} className="flex items-start gap-2 py-1 text-red-400">
            <span>❌</span>
            <span>{event.message}</span>
          </div>
        );

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
        <div className="flex items-center gap-2 ml-2">
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className={cn("text-sm", config.color)}>{config.name} Mode</span>
        </div>
        {isRunning && (
          <span className={cn("ml-auto text-sm animate-pulse", config.color)}>● running</span>
        )}
      </div>

      {/* Output area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {events.length === 0 && (
            <div className="text-gray-500">
              <div className={cn("mb-2", config.color)}>{config.welcome.title}</div>
              <div>{config.welcome.description}</div>
              <div className="pl-4 text-gray-600 mt-2">
                {config.welcome.features.map((f, i) => (
                  <div key={i}>• {f}</div>
                ))}
              </div>
              <div className="mt-4 text-gray-400">Type below to get started.</div>
            </div>
          )}

          {events.map((event, i) => renderEvent(event, i))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-gray-800 p-4 bg-[#252525]">
        <div className="flex items-center gap-2">
          <span className={config.color}>❯</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning}
            placeholder={isRunning ? "dory is working..." : config.placeholder}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </form>
    </div>
  );
}
