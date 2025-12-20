// Main Page - Chat Interface
"use client";

import * as React from "react";
import { useUIStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { Header } from "@/components/layout/header";
import { SettingsModal } from "@/components/settings/settings-modal";
import { KeyboardShortcutsModal } from "@/components/settings/keyboard-shortcuts";
import { CommandPalette } from "@/components/command-palette";
import { ShareDialog } from "@/components/share-dialog";
import { ProjectSettingsPanel } from "@/components/project-settings";
import { UsageDashboard } from "@/components/usage-dashboard";
import { CoderPanel, CoderSetup, Terminal } from "@/components/agents";
import { AgentChat } from "@/components/agents/agent-chat";
import type { Artifact } from "@/lib/store/conversations";
import type { AgentType } from "@/components/chat/welcome-screen";

export default function ChatPage() {
  const [activeArtifact, setActiveArtifact] = React.useState<Artifact | null>(null);

  const { sidebarOpen, artifactPanelOpen, closeArtifactPanel, setCommandPaletteOpen, setSettingsModalOpen, toggleSidebar, agentMode, setAgentMode, coderProjectDir, setCoderProjectDir } = useUIStore();
  const { createSession, updateSession, appendOutput } = useAgentSessionsStore();

  const handleNewChat = () => setAgentMode("chat");

  const startAgentSession = async (type: AgentType, projectDir?: string) => {
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} - ${new Date().toLocaleTimeString()}`;
    const sessionId = createSession(type, name, projectDir);
    updateSession(sessionId, { status: "starting" });
    
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", sessionId, agentType: type, projectDir }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status") updateSession(sessionId, { status: data.status, pid: data.pid });
            else if (data.type === "output") appendOutput(sessionId, data.data);
            else if (data.type === "exit") updateSession(sessionId, { status: "stopped" });
            else if (data.type === "error") updateSession(sessionId, { status: "error", error: data.message });
          } catch {}
        }
      }
    } catch (err) {
      updateSession(sessionId, { status: "error", error: (err as Error).message });
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCommandPaletteOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); setSettingsModalOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen, setSettingsModalOpen, toggleSidebar]);

  // Map agentMode to AgentChat mode
  const getAgentChatMode = () => {
    switch (agentMode) {
      case "chat": return "chat";
      case "computer": return "computer";
      case "browser": return "browser";
      case "research": return "research";
      default: return "chat";
    }
  };

  return (
    <div className="flex h-screen bg-background relative">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar onNewChat={handleNewChat} />

      <main id="main-content" className="flex-1 flex flex-col min-w-0">
        <Header />

        {/* Talk, Control, Browse, Research modes - all use AgentChat */}
        {(agentMode === "chat" || agentMode === "computer" || agentMode === "browser" || agentMode === "research") && (
          <AgentChat mode={getAgentChatMode()} className="flex-1 min-h-0" />
        )}

        {/* Coder mode - uses CoderPanel with project selector */}
        {agentMode === "coder" && (
          coderProjectDir ? (
            <CoderPanel projectDir={coderProjectDir} onBack={() => setCoderProjectDir("")} />
          ) : (
            <CoderSetup onStart={(dir, task) => {
              setCoderProjectDir(dir);
              // Task is passed to CoderPanel via the dir for now
              // Could extend to pass task type
            }} />
          )
        )}

        {/* Terminal mode */}
        {agentMode === "terminal" && <div className="flex-1 p-4"><Terminal cwd={coderProjectDir || undefined} /></div>}
      </main>

      {artifactPanelOpen && activeArtifact && <ArtifactPanel artifact={activeArtifact} onClose={() => { closeArtifactPanel(); setActiveArtifact(null); }} />}

      <SettingsModal />
      <KeyboardShortcutsModal />
      <CommandPalette />
      <ShareDialog />
      <ProjectSettingsPanel />
      <UsageDashboard />
    </div>
  );
}
