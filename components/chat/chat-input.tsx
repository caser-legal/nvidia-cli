// Chat Input Component
// Features 13-17, 124-126, 204-206: Input field with auto-resize, keyboard shortcuts

"use client";

import * as React from "react";
import { Send, Paperclip, Square, Loader2, MessageSquare, Code, Terminal, Monitor, Globe, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, estimateTokens } from "@/lib/utils";

type AgentMode = "chat" | "coder" | "computer" | "browser" | "support" | "terminal";

const modes = [
  { id: "chat" as const, name: "Chat", icon: MessageSquare },
  { id: "coder" as const, name: "Coder", icon: Code },
  { id: "computer" as const, name: "Computer", icon: Monitor },
  { id: "browser" as const, name: "Browser", icon: Globe },
  { id: "support" as const, name: "Support", icon: Headphones },
  { id: "terminal" as const, name: "Terminal", icon: Terminal },
];

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  agentMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  streamingMetrics?: { tokensPerSec: number; totalTokens: number } | null;
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  isStreaming = false,
  disabled = false,
  placeholder = "Message NVIDIA AI...",
  maxLength = 100000,
  agentMode = "chat",
  onModeChange,
  streamingMetrics,
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const [images, setImages] = React.useState<string[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const charCount = value.length;
  const tokenEstimate = estimateTokens(value);
  const currentMode = modes.find((m) => m.id === agentMode) || modes[0];
  const ModeIcon = currentMode.icon;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!value.trim() || disabled || isLoading) return;
    onSend(value.trim(), images.length > 0 ? images : undefined);
    setValue("");
    setImages([]);
    textareaRef.current?.focus();
  };

  const handleStop = () => {
    onStop?.();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setImages((prev) => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      }
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <TooltipProvider>
      <div className="border-t bg-background/80 backdrop-blur p-4">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap max-w-4xl mx-auto">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <img
                  src={img}
                  alt={`Upload ${index + 1}`}
                  className="h-16 w-16 object-cover rounded-lg border"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2 p-2 rounded-xl border bg-background shadow-sm focus-within:border-[#76B900] transition-colors">
            {/* Mode selector */}
            {onModeChange && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                        <ModeIcon className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">{currentMode.name}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" side="top">
                  {modes.map((m) => {
                    const Icon = m.icon;
                    return (
                      <DropdownMenuItem
                        key={m.id}
                        onClick={() => onModeChange(m.id)}
                        className={cn("gap-2", agentMode === m.id && "bg-accent")}
                      >
                        <Icon className="h-4 w-4" />
                        {m.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Attachment button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="h-9 w-9 shrink-0"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Attach image</TooltipContent>
            </Tooltip>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Textarea */}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || isLoading}
                autoResize
                className="border-0 focus-visible:ring-0 resize-none min-h-[40px] max-h-[200px] py-2 px-0 bg-transparent"
              />
            </div>

            {/* Character/token count */}
            {charCount > 0 && (
              <div className="text-xs text-muted-foreground shrink-0 self-center px-2">
                {charCount > 1000 ? `${(charCount/1000).toFixed(1)}k` : charCount}
              </div>
            )}

            {/* Send/Stop button */}
            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleStop}
                    className="h-9 w-9 shrink-0"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Stop</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSend}
                    disabled={!value.trim() || disabled || isLoading}
                    size="icon"
                    className="h-9 w-9 shrink-0 bg-[#76B900] hover:bg-[#5a8f00] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Send ↵</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Keyboard hint */}
          <div className="mt-2 text-xs text-muted-foreground text-center flex items-center justify-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↵</kbd> send · <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⇧↵</kbd> new line
            </span>
            {streamingMetrics && streamingMetrics.tokensPerSec > 0 && (
              <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">
                {streamingMetrics.tokensPerSec} tok/s
              </span>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
