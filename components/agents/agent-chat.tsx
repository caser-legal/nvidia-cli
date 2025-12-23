// Agent Chat Component
// Reusable terminal-like interface for all agent modes

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, ghcolors, dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { MessageSquare, Users, Square } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { useSettingsStore } from "@/lib/store";

interface AgentEvent {
  type: "status" | "message" | "tool_call" | "tool_result" | "error" | "complete" | "done" | "metrics";
  status?: string;
  role?: string;
  content?: string;
  name?: string;
  args?: string;
  result?: string;
  is_error?: boolean;
  message?: string;
  // Metrics for completed responses
  tokensPerSec?: number;
  totalTokens?: number;
  durationMs?: number;
}

type AgentMode = "dory" | "dory-supervised";

interface AgentChatProps {
  mode: AgentMode;
  sessionId?: string | null;
  className?: string;
}

const MODE_CONFIG = {
  dory: {
    name: "Dory",
    icon: MessageSquare,
    color: "text-[#76B900]",
    bgColor: "bg-[#76B900]",
    placeholder: "Ask dory anything...",
    welcome: {
      title: "NVIDIA CLI [codename: dory]",
      description: "Your co-worker with full system access",
      features: [
        "Read and write files on your system",
        "Execute shell commands (bash, git, xcodebuild, etc.)",
        "Search the web (Google, Tavily)",
        "Analyze GitHub repos and generate diagrams",
        "RAG: Index and search local documents",
        "Memory: Remembers context across sessions",
      ],
    },
  },
  "dory-supervised": {
    name: "Dory (Supervised)",
    icon: Users,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500",
    placeholder: "What would you like me to research and report on?",
    welcome: {
      title: "Dory (Supervised Mode)",
      description: "Multi-agent research with quality review loops",
      features: [
        "🔍 Search Specialist - parallel web search + local docs",
        "📋 Report Planner - structured outlines for complex topics",
        "✍️ Section Author - writes individual sections",
        "✅ Quality Reviewer - evaluates completeness, identifies gaps",
        "🔄 Reflection Loop - iterates until approved (max 3 rounds)",
        "📚 Source Deduplication - clean, numbered citations",
      ],
    },
  },
};

export function AgentChat({ mode, sessionId, className }: AgentChatProps) {
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [input, setInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [metrics, setMetrics] = React.useState<{ tokensPerSec: number; totalTokens: number; elapsed: number } | null>(null);
  const [currentTime, setCurrentTime] = React.useState<Date | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentSessionRef = React.useRef<string | null>(null);
  const streamStartRef = React.useRef<number>(0);
  const tokenCountRef = React.useRef<number>(0);
  const metricsIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const { sessions, createSession, appendOutput, updateSession, deleteSession, setActiveSession } = useAgentSessionsStore();
  const { fontSize, codeTheme } = useSettingsStore();
  
  const fontSizeClass = fontSize === "small" ? "text-xs" : fontSize === "large" ? "text-base" : "text-sm";
  const codeStyle = codeTheme === "github" ? ghcolors : codeTheme === "dracula" ? dracula : oneDark;

  // Live clock - only starts after mount to avoid hydration mismatch
  React.useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
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
          
          // Restore metrics from last metrics event
          const lastMetrics = [...loaded].reverse().find(e => e.type === "metrics");
          if (lastMetrics) {
            const elapsed = (lastMetrics.durationMs || 0) / 1000;
            setMetrics({
              tokensPerSec: lastMetrics.tokensPerSec || 0,
              totalTokens: lastMetrics.totalTokens || 0,
              elapsed: Math.round(elapsed * 10) / 10,
            });
          }
          
          // If session was "running" but we're loading it fresh, it was interrupted
          if (session.status === "running") {
            updateSession(sessionId, { status: "stopped" });
          }
        } catch {}
      }
    }
  }, [sessionId, sessions, updateSession]);

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
      // Save final metrics before stopping
      const finalElapsed = (Date.now() - streamStartRef.current);
      const finalTokPerSec = finalElapsed > 0 ? Math.round(tokenCountRef.current / (finalElapsed / 1000)) : 0;
      const metricsEvent: AgentEvent = {
        type: "metrics",
        tokensPerSec: finalTokPerSec,
        totalTokens: tokenCountRef.current,
        durationMs: finalElapsed,
      };
      setEvents(prev => [...prev, metricsEvent]);
      if (sid) appendOutput(sid, JSON.stringify(metricsEvent));
      
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
                <div className="text-gray-200 flex-1 prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white prose-li:text-gray-200">
                  <ReactMarkdown
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const inline = !match;
                        return !inline ? (
                          <SyntaxHighlighter
                            style={codeStyle}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: fontSize === "small" ? "11px" : fontSize === "large" ? "14px" : "12px" }}
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="bg-gray-800 px-1 py-0.5 rounded text-green-400" {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {mainContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        );

      case "tool_call":
        // Parse args to show friendly description
        const toolName = event.name || "";
        let friendlyDesc = "";
        try {
          const args = JSON.parse(event.args || "{}");
          if (toolName === "file_read" && args.path) {
            friendlyDesc = `Reading: ${args.path}`;
          } else if (toolName === "file_write" && args.path) {
            friendlyDesc = `Writing: ${args.path}`;
          } else if (toolName === "bash" && args.command) {
            friendlyDesc = `Running: ${args.command}`;
          } else if (toolName === "think" && args.thought) {
            friendlyDesc = `Thinking: ${args.thought}`;
          } else if (toolName === "google_search" || toolName === "tavily_search") {
            friendlyDesc = `Searching: ${args.query || args.q || ""}`;
          } else if (toolName === "set_project") {
            friendlyDesc = `Setting project: ${args.path || args.directory || ""}`;
          } else if (toolName === "rag_search" || toolName === "rag_query") {
            friendlyDesc = `RAG search: ${args.query || ""}`;
          } else {
            friendlyDesc = `${toolName}: ${event.args}`;
          }
        } catch {
          friendlyDesc = `${toolName}: ${event.args}`;
        }
        return (
          <div key={index} className="flex items-start gap-2 py-0.5 text-xs text-gray-400">
            <span className="text-yellow-500 shrink-0">⚡</span>
            <span className="break-all">{friendlyDesc}</span>
          </div>
        );

      case "tool_result":
        const resultLines = (event.result || "").split("\n");
        const truncated = resultLines.length > 15;
        const displayLines = truncated ? resultLines.slice(0, 15) : resultLines;
        return (
          <div key={index} className="py-0.5 pl-6 text-xs">
            <div className={cn("font-mono whitespace-pre-wrap break-all", event.is_error ? "text-red-400" : "text-gray-500")}>
              {displayLines.join("\n")}
              {truncated && <div className="text-gray-600 italic">... ({resultLines.length - 15} more lines)</div>}
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

      case "metrics":
        const elapsed = (event.durationMs || 0) / 1000;
        const timeStr = elapsed >= 60 
          ? `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s`
          : `${Math.round(elapsed * 10) / 10}s`;
        return (
          <div key={index} className="flex items-center gap-3 py-1 text-xs font-mono text-gray-600 border-t border-gray-800 mt-2 pt-2">
            <span>✓ completed</span>
            <span>{event.tokensPerSec} tok/s</span>
            <span>{event.totalTokens} tokens</span>
            <span>{timeStr}</span>
          </div>
        );

      default:
        return null;
    }
  };

  // Calculate total conversation tokens from all metrics events
  const conversationTokens = React.useMemo(() => {
    return events
      .filter(e => e.type === "metrics")
      .reduce((sum, e) => sum + (e.totalTokens || 0), 0);
  }, [events]);

  // Context window usage (Nemotron 3 Nano = 128K)
  const contextLimit = 128000;
  const contextPercent = Math.min(100, (conversationTokens / contextLimit) * 100);

  return (
    <div className={cn("flex flex-col h-full bg-[#1a1a1a] text-white font-mono", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-[#252525]">
        <div className="flex gap-1.5">
          <button 
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
            onClick={() => {
              if (currentSessionRef.current) {
                deleteSession(currentSessionRef.current);
              }
              setActiveSession(null);
              setEvents([]);
              setMetrics(null);
            }}
            title="Close & delete chat"
          />
          <button 
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
            onClick={() => {
              setActiveSession(null);
              setEvents([]);
              setMetrics(null);
            }}
            title="Minimize to sidebar"
          />
          <button 
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
            onClick={() => {
              setActiveSession(null);
              setEvents([]);
              setMetrics(null);
            }}
            title="New chat"
          />
        </div>
        <span className="text-sm text-gray-400 tabular-nums">
          {currentTime ? `${currentTime.toLocaleDateString()} ${currentTime.toLocaleTimeString()}` : ""}
        </span>
        {/* Metrics display */}
        <div className="ml-auto flex items-center gap-3 text-xs font-mono">
          {metrics && metrics.tokensPerSec > 0 && (
            <span className="text-gray-400 tabular-nums">{metrics.tokensPerSec} tok/s</span>
          )}
          {metrics && metrics.totalTokens > 0 && (
            <span className="text-gray-500 tabular-nums">{metrics.totalTokens} tokens</span>
          )}
          {metrics && metrics.elapsed > 0 && (
            <span className="text-gray-600 tabular-nums">
              {metrics.elapsed >= 60 
                ? `${Math.floor(metrics.elapsed / 60)}m ${Math.round(metrics.elapsed % 60)}s` 
                : `${metrics.elapsed}s`}
            </span>
          )}
          {isRunning && (
            <span className={cn("animate-pulse", config.color)}>●</span>
          )}
        </div>
      </div>

      {/* Output area */}
      <ScrollArea className="flex-1 p-4">
        <div className={cn("space-y-1", fontSizeClass)}>
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
        <div className="flex items-start gap-2 p-2 rounded-lg border border-gray-700/50 focus-within:border-[#76B900] transition-colors">
          <span className={cn(config.color, "leading-6")}>❯</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                setInput('');
                (e.target as HTMLTextAreaElement).style.height = 'auto';
              }
              // Enter to send (Shift+Enter for newline)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isRunning) {
                  handleSubmit(e);
                }
              }
            }}
            disabled={isRunning}
            placeholder={isRunning ? "dory is working..." : config.placeholder}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 resize-none min-h-[24px] max-h-[200px] leading-6"
            autoComplete="off"
            spellCheck={false}
            rows={1}
          />
          {isRunning ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleStop}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 gap-1 mt-1"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={!input.trim()}
              className={cn("gap-1 mt-1", config.color, "hover:bg-gray-800")}
            >
              Send
            </Button>
          )}
        </div>
        {/* Conversation stats */}
        {conversationTokens > 0 && (
          <div className="flex items-center justify-end gap-3 mt-2 text-[10px] text-gray-600">
            <span>{conversationTokens.toLocaleString()} total tokens</span>
            <span className={cn(
              contextPercent > 80 ? "text-red-500" : 
              contextPercent > 50 ? "text-yellow-500" : "text-gray-600"
            )}>
              {contextPercent.toFixed(1)}% context
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
