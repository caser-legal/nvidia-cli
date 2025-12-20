// Agent Mode Selector
// Simple icon dropdown for mode selection

"use client";

import * as React from "react";
import { MessageSquare, Code, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AgentMode = "chat" | "coder" | "terminal";

interface AgentModeSelectorProps {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  disabled?: boolean;
}

const modes = [
  { id: "chat" as const, name: "Chat", icon: MessageSquare },
  { id: "coder" as const, name: "Coder", icon: Code },
  { id: "terminal" as const, name: "Terminal", icon: Terminal },
];

export function AgentModeSelector({ mode, onModeChange, disabled }: AgentModeSelectorProps) {
  const currentMode = modes.find((m) => m.id === mode) || modes[0];
  const Icon = currentMode.icon;

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={disabled} className="h-9 w-9">
                <Icon className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{currentMode.name} mode</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" side="top" className="min-w-[120px]">
          {modes.map((m) => {
            const ModeIcon = m.icon;
            return (
              <DropdownMenuItem
                key={m.id}
                onClick={() => onModeChange(m.id)}
                className={cn("gap-2", mode === m.id && "bg-accent")}
              >
                <ModeIcon className="h-4 w-4" />
                {m.name}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
