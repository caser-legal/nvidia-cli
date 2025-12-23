// Chat Message Component
// Features 1-11, 18-25: Message display with markdown, code blocks, etc.

"use client";

import * as React from "react";
import { Copy, Check, Pencil, RefreshCw, MoreHorizontal, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, copyToClipboard, detectArtifacts } from "@/lib/utils";
import type { Message, Artifact } from "@/lib/store/conversations";

interface ChatMessageProps {
  message: Message;
  onEdit?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  isStreaming?: boolean;
  modelName?: string;
}

export function ChatMessage({
  message,
  onEdit,
  onRegenerate,
  onDelete,
  onArtifactClick,
  isStreaming = false,
  modelName,
}: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(message.content);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  // Feature 5: Copy button handler
  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Feature 10: Message editing
  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  // Feature 26: Detect artifacts in response
  const artifacts = React.useMemo(() => {
    if (isAssistant) {
      return detectArtifacts(message.content);
    }
    return [];
  }, [message.content, isAssistant]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "group relative py-4 animate-fade-in",
          // Feature 18-19: Message alignment
          isUser ? "message-user" : "message-assistant"
        )}
        role="article"
        aria-label={`${message.role} message`}
      >
        {/* Feature 93: Model badge for assistant messages */}
        {isAssistant && modelName && (
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 bg-muted rounded-full">{modelName}</span>
          </div>
        )}
        <div
          className={cn(
            "relative",
            // Feature 18-19: Message bubble styles
            isUser ? "message-bubble-user" : "message-bubble-assistant"
          )}
        >
          {/* Feature 8: Image display */}
          {message.images && message.images.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {message.images.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt={`Attached image ${index + 1}`}
                  className="max-h-64 rounded-lg border"
                />
              ))}
            </div>
          )}

          {/* Message content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[100px] p-2 border rounded-md bg-background resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="prose-chat">
              {/* Features 3-6, 20-21: Markdown rendering with code blocks */}
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  // Feature 4-5: Code blocks with syntax highlighting
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const language = match ? match[1] : "";
                    const codeString = String(children).replace(/\n$/, "");
                    const isInline = !match && !String(children).includes("\n");

                    if (!isInline && language) {
                      return (
                        <div className="code-block my-4">
                          <div className="code-block-header">
                            <span className="text-muted-foreground">{language}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(codeString)}
                              className="h-6 px-2"
                            >
                              {copied ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span className="ml-1 text-xs">
                                {copied ? "Copied!" : "Copy"}
                              </span>
                            </Button>
                          </div>
                          <SyntaxHighlighter
                            style={oneDark as { [key: string]: React.CSSProperties }}
                            language={language}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: "0 0 0.5rem 0.5rem",
                            }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }

                    // Feature 20: Inline code
                    return (
                      <code
                        className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  // Links open in new tab
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>

              {/* Feature 22: Typing indicator */}
              {isStreaming && (
                <span className="inline-flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-typing-dot" />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-typing-dot" style={{ animationDelay: "0.4s" }} />
                </span>
              )}
            </div>
          )}

          {/* Artifact badges (Feature 41) */}
          {artifacts.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {artifacts.map((artifact, index) => (
                <button
                  key={index}
                  onClick={() => onArtifactClick?.({
                    id: `${message.id}-artifact-${index}`,
                    title: artifact.title,
                    type: artifact.type,
                    language: artifact.language,
                    content: artifact.content,
                    version: 1,
                    createdAt: message.createdAt,
                  })}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                >
                  <span className="font-medium">{artifact.title}</span>
                </button>
              ))}
            </div>
          )}

          {/* Token usage display (Feature 155) */}
          {(message.inputTokens || message.outputTokens) && (
            <div className="mt-2 text-xs text-muted-foreground">
              {message.inputTokens && <span>In: {message.inputTokens}</span>}
              {message.inputTokens && message.outputTokens && <span> · </span>}
              {message.outputTokens && <span>Out: {message.outputTokens}</span>}
            </div>
          )}

          {/* Edit indicator */}
          {message.isEdited && (
            <span className="text-xs text-muted-foreground ml-2">(edited)</span>
          )}
        </div>

        {/* Message actions - Copy button + 3-dot menu */}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Quick copy button - always visible on hover */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => handleCopy(message.content)}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1 text-xs">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy message as markdown</TooltipContent>
          </Tooltip>

          {/* 3-dot menu for other actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {isUser && onEdit && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {isAssistant && onRegenerate && (
                <DropdownMenuItem onClick={() => onRegenerate(message.id)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(message.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Feature 22-24: Typing indicator and skeleton loaders
export function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status" aria-label="dory is thinking">
      <div className="typing-dot animate-typing-dot" />
      <div className="typing-dot animate-typing-dot" style={{ animationDelay: "0.2s" }} />
      <div className="typing-dot animate-typing-dot" style={{ animationDelay: "0.4s" }} />
      <span className="sr-only">dory is thinking...</span>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="py-4 animate-pulse" role="status" aria-label="Loading message">
      <div className="space-y-2">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton h-4 w-2/3" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
