// Sidebar Component - Simplified

"use client";

import * as React from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useUIStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface SidebarProps {
  onNewChat?: () => void;
}

export function Sidebar({ onNewChat }: SidebarProps) {
  const [mounted, setMounted] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { sessions, activeSessionId, setActiveSession, deleteSession, resetStaleSessions } = useAgentSessionsStore();

  React.useEffect(() => {
    resetStaleSessions();
  }, [resetStaleSessions]);

  const handleNewChat = () => {
    setActiveSession(null);
    router.push("/");
    onNewChat?.();
  };

  if (!sidebarOpen) {
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
      <aside className="w-72 max-w-72 min-w-72 border-r bg-sidebar flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <button onClick={handleNewChat} className="hover:opacity-80 transition-opacity">
            <img src="/nvidia-logo.webp" alt="NVIDIA" className="h-6" />
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close sidebar</TooltipContent>
          </Tooltip>
        </div>

        {/* New chat button */}
        <div className="p-3">
          <Button onClick={handleNewChat} className="w-full justify-start gap-2 bg-[#76B900] hover:bg-[#5a8f00] text-white">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Session list */}
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3">
            {!mounted ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No conversations yet</div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = activeSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                        isActive ? "bg-accent" : "hover:bg-accent/50"
                      )}
                      onClick={() => {
                        setActiveSession(session.id);
                        router.push("/");
                      }}
                    >
                      <MessageSquare className={cn("h-4 w-4 flex-shrink-0", session.status === "running" && "text-[#76B900] animate-pulse")} />
                      <span className="flex-1 truncate text-sm">
                        {session.name.slice(0, 25)}{session.name.length > 25 ? "..." : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
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
          </div>
        </ScrollArea>

        {/* Footer - Settings */}
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 px-2 py-2 h-auto"
            onClick={() => router.push("/settings")}
          >
            <img 
              src="/avatar.png" 
              alt="Settings" 
              className="w-8 h-8 rounded-full object-cover"
            />
            <span className="text-sm font-medium">Settings</span>
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
