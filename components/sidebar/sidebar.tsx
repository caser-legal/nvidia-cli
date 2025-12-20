// Sidebar Component
// Features 46-67, 196, 199-200, 207-211: Conversation list and management

"use client";

import * as React from "react";
import {
  Plus,
  Search,
  Settings,
  ChevronDown,
  ChevronRight,
  Pin,
  Archive,
  Trash2,
  MoreHorizontal,
  FolderPlus,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Square,
  Code,
  Monitor,
  Globe,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useConversationStore } from "@/lib/store/conversations";
import { useUIStore, useFolderStore, useProjectStore } from "@/lib/store";
import { useAgentSessionsStore, type AgentSession } from "@/lib/store/agent-sessions";
import { cn, groupByDate, formatRelativeDate } from "@/lib/utils";

interface SidebarProps {
  onNewChat?: () => void;
}

export function Sidebar({ onNewChat }: SidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dateFilter, setDateFilter] = React.useState("");
  const [modelFilter, setModelFilter] = React.useState("");
  const [mounted, setMounted] = React.useState(false);

  // Prevent hydration mismatch from date calculations
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Store state
  const {
    conversations,
    currentConversationId,
    createConversation,
    deleteConversation,
    setCurrentConversation,
    pinConversation,
    archiveConversation,
    searchConversations,
  } = useConversationStore();

  const { sidebarOpen, toggleSidebar, setSettingsModalOpen, setAgentMode } = useUIStore();
  const { folders, createFolder, toggleFolderExpanded } = useFolderStore();
  const { currentProjectId } = useProjectStore();
  
  // Agent sessions
  const { sessions, activeSessionId, setActiveSession, deleteSession, stopSession } = useAgentSessionsStore();

  // Filter conversations
  const filteredConversations = React.useMemo(() => {
    let result = conversations.filter((c) => !c.isArchived);
    
    // Filter by project
    if (currentProjectId) {
      result = result.filter((c) => c.projectId === currentProjectId);
    }
    
    // Filter by search
    if (searchQuery) {
      result = searchConversations(searchQuery).filter((c) => !c.isArchived);
    }
    
    return result;
  }, [conversations, currentProjectId, searchQuery, searchConversations]);

  // Group by date (Features 62-65)
  const groupedConversations = React.useMemo(() => {
    const pinned = filteredConversations.filter((c) => c.isPinned);
    const unpinned = filteredConversations.filter((c) => !c.isPinned);
    
    return {
      pinned,
      groups: groupByDate(unpinned),
    };
  }, [filteredConversations]);

  // Feature 46: Create new conversation and go to welcome screen
  const handleNewChat = () => {
    setCurrentConversation(null);
    setAgentMode("chat");
    onNewChat?.();
  };

  // Get agent icon
  const getAgentIcon = (type: string) => {
    switch (type) {
      case "coder": return Code;
      case "computer": return Monitor;
      case "browser": return Globe;
      case "support": return Headphones;
      default: return MessageSquare;
    }
  };

  if (!sidebarOpen) {
    // Collapsed sidebar
    return (
      <TooltipProvider>
        <div className="w-12 border-r bg-sidebar flex flex-col items-center py-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                <PanelLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleNewChat}>
                <Plus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "w-72 border-r bg-sidebar flex flex-col transition-all duration-300",
          "animate-slide-in-left"
        )}
        role="navigation"
        aria-label="Conversation sidebar"
      >
        {/* Header - Logo is clickable to start new chat */}
        <div className="p-4 border-b flex items-center justify-between">
          <button onClick={handleNewChat} className="hover:opacity-80 transition-opacity">
            <img src="/nvidia-logo.webp" alt="NVIDIA" className="h-6" />
          </button>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close sidebar</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Feature 207: New chat button */}
        <div className="p-3">
          <Button onClick={handleNewChat} className="w-full justify-start gap-2 bg-[#76B900] hover:bg-[#5a8f00] text-white">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Feature 208: Search input */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
              aria-label="Search conversations"
            />
          </div>
          {/* Features 145-146: Search filters */}
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 text-xs p-1.5 border rounded bg-background"
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date"
            >
              <option value="">All dates</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
            <select
              className="flex-1 text-xs p-1.5 border rounded bg-background"
              onChange={(e) => setModelFilter(e.target.value)}
              aria-label="Filter by model"
            >
              <option value="">All models</option>
              <option value="nemotron">Nemotron</option>
              <option value="deepseek">DeepSeek</option>
              <option value="llama">Llama</option>
            </select>
          </div>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3">
            {!mounted ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Loading...
              </div>
            ) : (
              <>
                {/* Running Agent Sessions */}
                {sessions.filter(s => s.status === "running" || s.status === "starting").length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Running Agents
                    </div>
                    {sessions.filter(s => s.status === "running" || s.status === "starting").map((session) => {
                      const Icon = getAgentIcon(session.type);
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                            activeSessionId === session.id ? "bg-accent" : "hover:bg-accent/50"
                          )}
                          onClick={() => setActiveSession(session.id)}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[#76B900]" />
                          <div className="flex-1 min-w-0">
                            <span className="truncate text-sm">{session.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Call API to stop the process
                              try {
                                await fetch("/api/agents/run", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "stop", sessionId: session.id }),
                                });
                              } catch {}
                              stopSession(session.id);
                            }}
                          >
                            <Square className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Stopped Agent Sessions */}
                {sessions.filter(s => s.status === "stopped" || s.status === "error").length > 0 && (
                  <div className="mb-4">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      Recent Agents
                    </div>
                    {sessions.filter(s => s.status === "stopped" || s.status === "error").slice(0, 5).map((session) => {
                      const Icon = getAgentIcon(session.type);
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                            activeSessionId === session.id ? "bg-accent" : "hover:bg-accent/50"
                          )}
                          onClick={() => setActiveSession(session.id)}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <span className="truncate text-sm text-muted-foreground">{session.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pinned conversations (Feature 52) */}
                {groupedConversations.pinned.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </div>
                    {groupedConversations.pinned.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onClick={() => setCurrentConversation(conv.id)}
                        onPin={() => pinConversation(conv.id, !conv.isPinned)}
                        onArchive={() => archiveConversation(conv.id, true)}
                        onDelete={() => deleteConversation(conv.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Grouped conversations (Features 62-65) */}
                {groupedConversations.groups.map((group) => (
                  <div key={group.label} className="mb-4">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.items.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onClick={() => setCurrentConversation(conv.id)}
                        onPin={() => pinConversation(conv.id, !conv.isPinned)}
                        onArchive={() => archiveConversation(conv.id, true)}
                        onDelete={() => deleteConversation(conv.id)}
                      />
                    ))}
                  </div>
                ))}

                {filteredConversations.length === 0 && sessions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {searchQuery ? "No conversations found" : "No conversations yet"}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer (Features 210-211) */}
        <div className="p-3 border-t space-y-2">
          {/* Feature 211: User profile */}
          <div className="flex items-center gap-2 px-2 py-1">
            <img 
              src="/avatar.png" 
              alt="CASER" 
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">CASER</div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => setSettingsModalOpen(true)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

// Conversation item component
interface ConversationItemProps {
  conversation: {
    id: string;
    title: string;
    isPinned: boolean;
    hasUnread: boolean;
    lastMessageAt: Date;
  };
  isActive: boolean;
  onClick: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function ConversationItem({
  conversation,
  isActive,
  onClick,
  onPin,
  onArchive,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
        isActive ? "bg-accent" : "hover:bg-accent/50"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-current={isActive ? "page" : undefined}
    >
      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm">{conversation.title}</span>
          {conversation.hasUnread && (
            <span className="w-2 h-2 bg-primary rounded-full shrink-0" />
          )}
        </div>
      </div>

      {/* Feature 66: Context menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onPin}>
            <Pin className="h-4 w-4 mr-2" />
            {conversation.isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
