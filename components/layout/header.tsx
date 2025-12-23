// Header Component
// Features 201-203, 212: Persistent header with model selector

"use client";

import * as React from "react";
import { ChevronDown, Pencil, Check, X, Zap } from "lucide-react";
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
import { useSettingsStore } from "@/lib/store";
import { NVIDIA_MODELS, type ModelId } from "@/lib/nvidia";
import { cn } from "@/lib/utils";

export function Header() {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { getCurrentConversation, updateConversation } = useConversationStore();
  const { defaultModel, setDefaultModel } = useSettingsStore();

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const conversation = mounted ? getCurrentConversation() : null;

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
      {/* Dory branding - unified mode */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[#76B900]" />
        <span className="font-medium text-[#76B900]">Dory</span>
      </div>

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
        ) : null}
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
              onClick={() => !model.disabled && handleModelChange(id as ModelId)}
              className={cn(
                "flex flex-col items-start py-3",
                model.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
              disabled={model.disabled}
            >
              <div className="flex items-center gap-2 w-full">
                <span className={cn("font-medium", model.disabled && "line-through")}>
                  {model.name}
                </span>
                {currentModel === id && !model.disabled && (
                  <Check className="h-4 w-4 ml-auto text-primary" />
                )}
              </div>
              <span className={cn(
                "text-xs whitespace-normal",
                model.disabled ? "text-muted-foreground/50" : "text-muted-foreground"
              )}>
                {model.disabled ? "Intentionally disabled" : model.description}
              </span>
              {/* Feature 88: Context window indicator */}
              {!model.disabled && (
                <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{(model.contextWindow / 1000).toFixed(0)}K ctx</span>
                  {model.supportsTools && <span>• Tools</span>}
                  {model.supportsImages && <span>• Vision</span>}
                </div>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
