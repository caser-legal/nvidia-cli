// Command Palette Component
// Feature 150: Command palette (Cmd/Ctrl+K)

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore, useProjectStore, useSettingsStore } from "@/lib/store";
import { useConversationStore } from "@/lib/store/conversations";
import {
  MessageSquare,
  Plus,
  Settings,
  Search,
  FolderOpen,
  Moon,
  Sun,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setSettingsModalOpen, setKeyboardShortcutsOpen } = useUIStore();
  const { createConversation, conversations, setCurrentConversation } = useConversationStore();
  const { projects, setCurrentProject } = useProjectStore();
  const { theme, setTheme } = useSettingsStore();

  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Build commands list
  const commands: Command[] = React.useMemo(() => {
    const cmds: Command[] = [
      {
        id: "new-chat",
        label: "New Chat",
        icon: <Plus className="h-4 w-4" />,
        action: () => { createConversation(); setCommandPaletteOpen(false); },
        keywords: ["create", "conversation"],
      },
      {
        id: "settings",
        label: "Open Settings",
        icon: <Settings className="h-4 w-4" />,
        action: () => { setCommandPaletteOpen(false); setSettingsModalOpen(true); },
        keywords: ["preferences", "config"],
      },
      {
        id: "shortcuts",
        label: "Keyboard Shortcuts",
        icon: <Keyboard className="h-4 w-4" />,
        action: () => { setCommandPaletteOpen(false); setKeyboardShortcutsOpen(true); },
        keywords: ["keys", "hotkeys"],
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        action: () => { setTheme(theme === "dark" ? "light" : "dark"); setCommandPaletteOpen(false); },
        keywords: ["dark", "light", "appearance"],
      },
    ];

    // Add recent conversations
    conversations.slice(0, 5).forEach((conv) => {
      cmds.push({
        id: `conv-${conv.id}`,
        label: conv.title,
        icon: <MessageSquare className="h-4 w-4" />,
        action: () => { setCurrentConversation(conv.id); setCommandPaletteOpen(false); },
        keywords: ["chat", "conversation"],
      });
    });

    // Add projects
    projects.forEach((proj) => {
      cmds.push({
        id: `proj-${proj.id}`,
        label: `Project: ${proj.name}`,
        icon: <FolderOpen className="h-4 w-4" />,
        action: () => { setCurrentProject(proj.id); setCommandPaletteOpen(false); },
        keywords: ["folder", "workspace"],
      });
    });

    return cmds;
  }, [conversations, projects, theme, createConversation, setCurrentConversation, setCurrentProject, setTheme, setCommandPaletteOpen, setSettingsModalOpen, setKeyboardShortcutsOpen]);

  // Filter commands
  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords?.some((k) => k.includes(q))
    );
  }, [commands, query]);

  // Reset selection when query changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  React.useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandPaletteOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case "Escape":
        setCommandPaletteOpen(false);
        break;
    }
  };

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogContent className="p-0 max-w-lg overflow-hidden" onKeyDown={handleKeyDown}>
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground mr-2" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 px-0"
          />
        </div>

        <ScrollArea className="max-h-[300px]">
          <div className="p-2">
            {filteredCommands.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                  )}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="text-muted-foreground">{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex gap-4">
          <span><kbd className="px-1 bg-muted rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 bg-muted rounded">↵</kbd> Select</span>
          <span><kbd className="px-1 bg-muted rounded">Esc</kbd> Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
