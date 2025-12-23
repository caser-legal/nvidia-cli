// Terminal Inner Component (client-only)
// Actual xterm.js implementation

"use client";

import * as React from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalInnerProps {
  cwd?: string;
  wsUrl?: string;
  onData?: (data: string) => void;
}

export default function TerminalInner({ cwd, wsUrl = "ws://localhost:3001", onData }: TerminalInnerProps) {
  const terminalRef = React.useRef<HTMLDivElement>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState<"connecting" | "connected" | "error" | "closed">("connecting");
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
      theme: {
        background: "#1a1a1a",
        foreground: "#e5e5e5",
        cursor: "#76B900",
        cursorAccent: "#1a1a1a",
        selectionBackground: "#76B90050",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    
    // Delay fit to ensure container is sized
    setTimeout(() => fitAddon.fit(), 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[90m● Connecting to terminal server...\x1b[0m");

    // Connect WebSocket with error handling
    const connectWebSocket = () => {
      try {
        const url = cwd ? `${wsUrl}?cwd=${encodeURIComponent(cwd)}` : wsUrl;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus("connected");
          term.writeln("\x1b[32m● Connected to terminal server\x1b[0m");
          term.writeln("");
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "output") {
              term.write(msg.data);
              onData?.(msg.data);
            } else if (msg.type === "exit") {
              term.writeln(`\x1b[33m● Process exited with code ${msg.code}\x1b[0m`);
            } else if (msg.type === "session") {
              term.writeln(`\x1b[90mSession: ${msg.id}\x1b[0m`);
            }
          } catch {
            term.write(event.data);
          }
        };

        ws.onerror = () => {
          setConnectionStatus("error");
        };

        ws.onclose = () => {
          setConnectionStatus("closed");
          term.writeln("");
          term.writeln("\x1b[31m● Terminal server not running\x1b[0m");
          term.writeln("");
          term.writeln("\x1b[33mTo start the terminal server, run in a separate terminal:\x1b[0m");
          term.writeln("");
          term.writeln("  \x1b[36mcd /Users/home/nvidia-cli\x1b[0m");
          term.writeln("  \x1b[36mnpx ts-node lib/terminal-server.ts\x1b[0m");
          term.writeln("");
          term.writeln("\x1b[90mOr add to package.json scripts and run: npm run terminal\x1b[0m");
        };

        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data }));
          }
        });
      } catch (err) {
        setConnectionStatus("error");
        term.writeln(`\x1b[31m● Failed to connect: ${err}\x1b[0m`);
      }
    };

    connectWebSocket();

    const handleResize = () => {
      fitAddon.fit();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Capture refs at effect time for cleanup
    const currentReconnectTimeout = reconnectTimeoutRef.current;
    const currentWs = wsRef.current;

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (currentReconnectTimeout) clearTimeout(currentReconnectTimeout);
      currentWs?.close();
      term.dispose();
    };
  }, [cwd, wsUrl, onData]);

  return (
    <div className="h-full w-full flex flex-col">
      {connectionStatus === "error" || connectionStatus === "closed" ? (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
          Terminal server not running. See instructions below.
        </div>
      ) : null}
      <div
        ref={terminalRef}
        className="flex-1 bg-[#1a1a1a] rounded-lg overflow-hidden"
        style={{ padding: "8px", minHeight: "300px" }}
      />
    </div>
  );
}
