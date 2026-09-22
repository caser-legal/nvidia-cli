// Terminal Component
// xterm.js terminal with WebSocket connection

"use client";

import * as React from "react";
import dynamic from "next/dynamic";

interface TerminalProps {
  cwd?: string;
  wsUrl?: string;
  onData?: (data: string) => void;
}

// Dynamically import xterm to avoid SSR issues
const TerminalInner = dynamic(() => import("./terminal-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#1a1a1a] rounded-lg flex items-center justify-center text-muted-foreground">
      Loading terminal...
    </div>
  ),
});

export function Terminal(props: TerminalProps) {
  return <TerminalInner {...props} />;
}
