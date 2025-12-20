// Agent Chat Component
// Reusable terminal-like interface for all agent modes

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Monitor, Globe, Headphones, MessageSquare, Code, Square, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";

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

type AgentMode = "chat" | "computer" | "browser" | "research" | "coder" | "coordinator";

interface AgentChatProps {
  mode: AgentMode;
  sessionId?: string | null;
  className?: string;
}

const MODE_CONFIG = {
  chat: {
    name: "Dory",
    icon: MessageSquare,
    color: "text-[#76B900]",
    bgColor: "bg-[#76B900]",
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
    name: "Controller",
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
    name: "Browser",
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
    name: "Researcher",
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
  coder: {
    name: "Coder",
    icon: Code,
    color: "text-blue-400",
    bgColor: "bg-blue-500",
    placeholder: "What would you like me to build or work on?",
    welcome: {
      title: "Autonomous Coder",
      description: "Build entire apps from start to finish. Watch it work.",
      features: [
        "Never overflows context window",
        "Never gets dumb—compact memory across sessions",
        "Never say \"just do it\" again",
        "Picks up exactly where it left off, every time",
      ],
    },
  },
  coordinator: {
    name: "Coordinator",
    icon: Users,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500",
    placeholder: "What would you like me to research and report on?",
    welcome: {
      title: "Multi-Agent Coordinator",
      description: "I orchestrate a team of specialist agents for deep research",
      features: [
        "Search Specialist - finds information from the web",
        "Report Writer - creates well-structured reports",
        "Quality Reviewer - verifies helpfulness and completeness",
        "Automatic workflow: Search → Write → Review → Deliver",
      ],
    },
  },
};

export function AgentChat({ mode, sessionId, className }: AgentChatProps) {
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [input, setInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [metrics, setMetrics] = React.useState<{ tokensPerSec: number; totalTokens: number; elapsed: number } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentSessionRef = React.useRef<string | null>(null);
  const streamStartRef = React.useRef<number>(0);
  const tokenCountRef = React.useRef<number>(0);
  const metricsIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const { sessions, createSession, appendOutput, updateSession } = useAgentSessionsStore();
  
  // Estimate tokens from text (roughly 4 chars per token)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  
  // Start metrics tracking
  const startMetrics = () => {
    streamStartRef.current = Date.now();
    tokenCountRef.current = 0;
    setMetrics({ tokensPerSec: 0, totalTokens: 0, elapsed: 0 });
    
    // Update metrics every 100ms
    metricsIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - streamStartRef.current) / 1000;
      const tokPerSec = elapsed > 0 ? Math.round(tokenCountRef.current / elapsed) : 0;
      setMetrics({ tokensPerSec: tokPerSec, totalTokens: tokenCountRef.current, elapsed: Math.round(elapsed * 10) / 10 });
    }, 100);
  };
  
  // Stop metrics tracking
  const stopMetrics = () => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
  };
  
  // Add tokens to count
  const addTokens = (text: string) => {
    tokenCountRef.current += estimateTokens(text);
  };

  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  // Load session if sessionId provided
  React.useEffect(() => {
    if (sessionId && sessionId !== currentSessionRef.current) {
      const session = sessions.find(s => s.id === sessionId);
      if (session?.output?.length) {
        try {
          const loaded = session.output.map(o => JSON.parse(o) as AgentEvent);
          setEvents(loaded);
          currentSessionRef.current = sessionId;
        } catch {}
      }
    }
  }, [sessionId, sessions]);

  // Stop handler
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsRunning(false);
      stopMetrics();
      setEvents(prev => [...prev, { type: "status", status: "stopped" }]);
    }
  };

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup metrics interval on unmount
  React.useEffect(() => {
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, []);

  // Clear events when mode changes (but not if loading a session)
  React.useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      currentSessionRef.current = null;
      setMetrics(null);
    }
  }, [mode, sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    const userMessage = input.trim();
    setInput("");
    setIsRunning(true);
    startMetrics();

    // Create session if new conversation
    let sid = currentSessionRef.current;
    if (!sid) {
      const name = userMessage.slice(0, 20) + (userMessage.length > 20 ? "..." : "");
      sid = createSession(mode, name, "/Users/home");
      currentSessionRef.current = sid;
    }

    const userEvent: AgentEvent = { type: "message", role: "user", content: userMessage };
    setEvents(prev => [...prev, userEvent]);
    appendOutput(sid, JSON.stringify(userEvent));
    updateSession(sid, { status: "running" });

    abortControllerRef.current = new AbortController();

    // Build conversation history from events
    const conversationHistory = events
      .filter(e => e.type === "message" && (e.role === "user" || e.role === "assistant"))
      .map(e => ({ role: e.role as string, content: e.content || "" }));

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
          messages: [...conversationHistory, { role: "user", content: userMessage }],
          mode,
          projectDir: "/Users/home",
        }),
        signal: abortControllerRef.current.signal,
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
              // Track tokens from content
              if (event.content) addTokens(event.content);
              if (event.result) addTokens(event.result);
              setEvents(prev => [...prev, event]);
              appendOutput(sid!, JSON.stringify(event));
            } catch {}
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        stopMetrics();
        return;
      }
      setEvents(prev => [...prev, {
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }]);
      if (sid) updateSession(sid, { status: "error" });
    } finally {
      setIsRunning(false);
      stopMetrics();
      abortControllerRef.current = null;
      if (sid) updateSession(sid, { status: "stopped" });
      inputRef.current?.focus();
    }
  };

  // Parse thinking blocks
  const parseContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
    const thinking = thinkMatch ? thinkMatch[1].trim() : null;
    const mainContent = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return { thinking, mainContent };
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
        const { thinking, mainContent } = parseContent(event.content || "");
        return (
          <div key={index} className="py-2">
            {thinking && (
              <div className="mb-2 pl-3 border-l border-gray-700 text-[11px] text-gray-500 italic leading-relaxed max-h-24 overflow-y-auto">
                <span className="text-gray-600 not-italic">💭 </span>{thinking}
              </div>
            )}
            {mainContent && (
              <div className="flex items-start gap-2">
                <span className={cn("font-mono shrink-0", config.color)}>[dory]</span>
                <div className="text-gray-200 flex-1 prose prose-invert prose-sm max-w-none prose-pre:bg-gray-800 prose-pre:text-gray-200 prose-code:text-green-400 prose-headings:text-white prose-strong:text-white prose-li:text-gray-200">
                  <ReactMarkdown>{mainContent}</ReactMarkdown>
                </div>
              </div>
            )}
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
        {/* Metrics display */}
        <div className="ml-auto flex items-center gap-3 text-xs font-mono">
          {metrics && metrics.tokensPerSec > 0 && (
            <span className="text-gray-400 tabular-nums">{metrics.tokensPerSec} tok/s</span>
          )}
          {metrics && metrics.totalTokens > 0 && (
            <span className="text-gray-500 tabular-nums">{metrics.totalTokens} tokens</span>
          )}
          {metrics && metrics.elapsed > 0 && (
            <span className="text-gray-600 tabular-nums">{metrics.elapsed}s</span>
          )}
          {isRunning && (
            <span className={cn("animate-pulse", config.color)}>●</span>
          )}
        </div>
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
          {isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleStop}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 gap-1"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
