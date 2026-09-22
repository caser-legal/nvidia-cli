// Header Component
// Features 201, 212: Persistent header with editable title

"use client";

import * as React from "react";
import { Pencil, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConversationStore } from "@/lib/store/conversations";
import { cn } from "@/lib/utils";

export function Header() {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { getCurrentConversation, updateConversation } = useConversationStore();

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
    </header>
  );
}
