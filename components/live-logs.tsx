"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LiveLogsProps {
  className?: string;
  maxLines?: number;
}

export function LiveLogs({ className, maxLines = 500 }: LiveLogsProps) {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [connected, setConnected] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const autoScrollRef = React.useRef(true);

  React.useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource("/api/logs?stream=true&lines=100");

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.log) {
            const newLines = data.log.split("\n").filter((line: string) => line.trim());
            setLogs((prev) => {
              const updated = [...prev, ...newLines];
              return updated.slice(-maxLines);
            });
          }
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();
        // Reconnect after 2 seconds
        setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
    };
  }, [maxLines]);

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  return (
    <div className={cn("relative flex flex-col overflow-hidden", className)}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <span className={cn(
          "w-2 h-2 rounded-full",
          connected ? "bg-green-500 animate-pulse" : "bg-red-500"
        )} />
        <span className="text-[10px] text-muted-foreground">
          {connected ? "LIVE" : "RECONNECTING..."}
        </span>
      </div>
      <ScrollArea 
        ref={scrollRef} 
        className="flex-1 min-h-0 rounded-lg bg-black/95 p-2"
        onScrollCapture={handleScroll}
      >
        <div className="font-mono text-[11px] leading-relaxed space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-gray-500 p-2">Waiting for logs...</div>
          ) : (
            logs.map((line, i) => (
              <LogLine key={i} line={line} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  // Color code different log types
  let className = "text-gray-300";
  
  if (line.includes("error") || line.includes("Error") || line.includes("ERROR")) {
    className = "text-red-400";
  } else if (line.includes("warn") || line.includes("Warning") || line.includes("WARN")) {
    className = "text-yellow-400";
  } else if (line.includes("✓") || line.includes("success") || line.includes("compiled")) {
    className = "text-green-400";
  } else if (line.includes("GET") || line.includes("POST") || line.includes("PUT") || line.includes("DELETE")) {
    className = "text-blue-400";
  } else if (line.includes("○") || line.includes("●")) {
    className = "text-cyan-400";
  } else if (line.startsWith(">") || line.includes("npm")) {
    className = "text-purple-400";
  }

  // Strip ANSI codes
  const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "");

  return (
    <div className={cn("whitespace-pre-wrap break-all", className)}>
      {cleanLine}
    </div>
  );
}
