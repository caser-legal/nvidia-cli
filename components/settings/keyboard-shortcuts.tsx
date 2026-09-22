// Keyboard Shortcuts Modal
// Feature 113: Keyboard shortcuts reference

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/lib/store";

const shortcuts = [
  { category: "General", items: [
    { keys: ["⌘", "K"], description: "Open command palette" },
    { keys: ["⌘", "N"], description: "New conversation" },
    { keys: ["⌘", ","], description: "Open settings" },
    { keys: ["⌘", "/"], description: "Toggle sidebar" },
    { keys: ["Esc"], description: "Close modal / Cancel" },
  ]},
  { category: "Chat", items: [
    { keys: ["Enter"], description: "Send message" },
    { keys: ["Shift", "Enter"], description: "New line" },
    { keys: ["⌘", "↑"], description: "Edit last message" },
    { keys: ["⌘", "Shift", "C"], description: "Copy last response" },
  ]},
  { category: "Navigation", items: [
    { keys: ["⌘", "["], description: "Previous conversation" },
    { keys: ["⌘", "]"], description: "Next conversation" },
    { keys: ["⌘", "1-9"], description: "Switch to conversation 1-9" },
  ]},
  { category: "Artifacts", items: [
    { keys: ["⌘", "E"], description: "Toggle artifact panel" },
    { keys: ["⌘", "Shift", "F"], description: "Fullscreen artifact" },
    { keys: ["⌘", "Shift", "D"], description: "Download artifact" },
  ]},
];

export function KeyboardShortcutsModal() {
  const { keyboardShortcutsOpen, setKeyboardShortcutsOpen } = useUIStore();

  return (
    <Dialog open={keyboardShortcutsOpen} onOpenChange={setKeyboardShortcutsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, j) => (
                          <kbd
                            key={j}
                            className="px-2 py-1 text-xs bg-muted rounded border min-w-[24px] text-center"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
