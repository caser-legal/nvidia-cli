// Welcome Screen Component
// Mode selection cards for different dory capabilities

"use client";

import * as React from "react";
import { MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentType = "dory" | "dory-supervised";

interface WelcomeScreenProps {
  onAgentSelect: (agent: AgentType) => void;
  currentAgent?: AgentType;
}

const MODES = [
  {
    id: "dory" as const,
    name: "Dory",
    description: "Full autonomy — coding, research, file ops, web search",
    icon: MessageSquare,
    color: "from-[#76B900] to-[#5a8f00]",
  },
  {
    id: "dory-supervised" as const,
    name: "Dory (Supervised)",
    description: "Multi-agent research with quality review loops",
    icon: Users,
    color: "from-yellow-500 to-yellow-600",
  },
];

// NVIDIA Logo SVG
function NvidiaLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.453 0-.87-.074-1.167-.181v-4.322c1.453.123 1.746.588 2.615 2.023l1.97-1.64s-1.665-1.9-4.16-1.9c-.142 0-.282.007-.425.018v-.775zm0-4.083v2.026a7.633 7.633 0 0 1 .424-.036c5.136-.04 8.508 4.386 8.508 4.386s-3.882 4.863-7.932 4.863a6.238 6.238 0 0 1-1-.08v1.482c.282.027.57.044.863.044 3.853 0 6.64-1.94 9.34-4.22.456.357 2.327 1.263 2.712 1.652-2.476 2.04-8.239 3.68-11.937 3.68-.33 0-.652-.015-.978-.044v1.632H24V4.715H8.948zm0 9.89v1.375c-3.95-.555-5.039-4.208-5.039-4.208s1.994-2.185 5.039-2.49v1.43c-1.236.093-2.217.672-2.846 1.315 0 0 .587 1.963 2.846 2.578zm-5.09-2.893s1.66-2.452 5.09-2.756V4.715H0v14.57h3.858v-7.573z" />
    </svg>
  );
}

export function WelcomeScreen({ onAgentSelect, currentAgent = "dory" }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* NVIDIA Logo */}
      <NvidiaLogo className="w-16 h-16 text-[#76B900] mb-6" />

      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold mb-2">dory</h1>
        <p className="text-muted-foreground text-sm">
          Powered by NVIDIA NIM × Nemotron
        </p>
      </div>

      {/* Mode selection grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isSelected = currentAgent === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onAgentSelect(mode.id)}
              className={cn(
                "relative p-4 rounded-xl border text-left transition-all group",
                isSelected
                  ? "border-[#76B900] bg-[#76B900]/10"
                  : "border-border hover:border-[#76B900]/50 bg-background/50 hover:bg-background"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br",
                mode.color
              )}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="font-medium mb-1">{mode.name}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">
                {mode.description}
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#76B900]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
