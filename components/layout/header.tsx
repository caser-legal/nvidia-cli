// Header Component
// Features 201-203, 212: Persistent header with mode/model selectors

"use client";

import * as React from "react";
import { ChevronDown, Pencil, Check, X, MessageSquare, Code, Monitor, Globe, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationStore } from "@/lib/store/conversations";
import { useUIStore, useSettingsStore } from "@/lib/store";
import { NVIDIA_MODELS, type ModelId } from "@/lib/nvidia";
import { cn } from "@/lib/utils";

// Agent modes
const MODES = [
  { id: "chat", name: "Talk", icon: MessageSquare, color: "#76B900" },
  { id: "coder", name: "Code", icon: Code, color: "#3B82F6" },
  { id: "computer", name: "Control", icon: Monitor, color: "#8B5CF6" },
  { id: "browser", name: "Browse", icon: Globe, color: "#F97316" },
  { id: "research", name: "Research", icon: Headphones, color: "#EC4899" },
] as const;

type AgentMode = typeof MODES[number]["id"];

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

export function Header() {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { getCurrentConversation, updateConversation } = useConversationStore();
  const { agentMode, setAgentMode } = useUIStore();
  const { defaultModel, setDefaultModel } = useSettingsStore();

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const conversation = mounted ? getCurrentConversation() : null;
  const currentMode = MODES.find((m) => m.id === agentMode) || MODES[0];
  const ModeIcon = currentMode.icon;

  // Feature 212: Editable conversation title
  const handleStartEdit = () => {
    if (conversation) {
      setEditTitle(conversation.title);
      setIsEditingTitle(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSaveTitle = () => {
    if (conversation && editTitle.trim()) {
      updateConversation(conversation.id, { title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitle("");
  };

  // Feature 90: Switch models mid-conversation or set default
  const handleModelChange = (modelId: ModelId) => {
    if (conversation) {
      updateConversation(conversation.id, { model: modelId });
    } else {
      setDefaultModel(modelId);
    }
  };

  // Get current model (from conversation or default)
  const currentModel = conversation?.model as ModelId || defaultModel;

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-4 gap-4">
      {/* Mode selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2">
            <ModeIcon className="h-4 w-4" style={{ color: currentMode.color }} />
            <span className="max-w-[150px] truncate">
              {currentMode.name}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <DropdownMenuItem
                key={mode.id}
                onClick={() => setAgentMode(mode.id)}
                className={cn("gap-2", agentMode === mode.id && "bg-accent")}
              >
                <Icon className="h-4 w-4" style={{ color: mode.color }} />
                {mode.name}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Feature 212: Conversation title */}
      <div className="flex-1 flex items-center justify-center">
        {conversation ? (
          isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="h-8 w-64 text-center"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 hover:bg-accent px-3 py-1 rounded-md transition-colors group"
            >
              <span className="font-medium truncate max-w-[300px]">
                {conversation.title}
              </span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
            </button>
          )
        ) : (
          <span className="text-muted-foreground">New Conversation</span>
        )}
      </div>

      {/* Feature 203: Model selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <span className="max-w-[150px] truncate">
              {NVIDIA_MODELS[currentModel]?.name || currentModel}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-96 max-h-[400px] overflow-y-auto">
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {Object.entries(NVIDIA_MODELS).map(([id, model]) => (
            <DropdownMenuItem
              key={id}
              onClick={() => handleModelChange(id as ModelId)}
              className="flex flex-col items-start py-3 cursor-pointer"
            >
              <div className="flex items-center gap-2 w-full">
                <span className="font-medium">{model.name}</span>
                {currentModel === id && (
                  <Check className="h-4 w-4 ml-auto text-primary" />
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                {model.description}
              </span>
              {/* Feature 88: Context window indicator */}
              <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                <span>{(model.contextWindow / 1000).toFixed(0)}K ctx</span>
                {model.supportsTools && <span>• Tools</span>}
                {model.supportsImages && <span>• Vision</span>}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
