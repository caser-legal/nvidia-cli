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
import { CoderPanel, Terminal } from "@/components/agents";
import { AgentChat } from "@/components/agents/agent-chat";
import { FolderOpen } from "lucide-react";
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

        {/* Code mode - needs project directory */}
        {agentMode === "coder" && (
          coderProjectDir ? (
            <>
              <CoderPanel projectDir={coderProjectDir} />
              <div className="border-t p-2 flex items-center gap-2 bg-background/80">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">{coderProjectDir}</code>
                <button onClick={() => startAgentSession("coder", coderProjectDir)} className="px-3 py-1 text-sm bg-[#76B900] hover:bg-[#5a8f00] text-white rounded-md">Start Agent</button>
                <button onClick={() => setCoderProjectDir("")} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <FolderOpen className="h-10 w-10 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Code Mode</h2>
                <p className="text-muted-foreground">Select a project directory to start the autonomous coder</p>
              </div>
              <div className="flex items-center gap-2 w-full max-w-md">
                <input type="text" placeholder="/Users/home/project" value={coderProjectDir} onChange={(e) => setCoderProjectDir(e.target.value)} className="flex-1 px-3 py-2 border rounded-md bg-background focus:border-[#76B900] outline-none" />
                <button onClick={() => { const p = prompt("Enter path:", "/Users/home/"); if (p) setCoderProjectDir(p); }} className="p-2 border rounded-md hover:bg-accent"><FolderOpen className="h-5 w-5" /></button>
              </div>
              {coderProjectDir && <button onClick={() => startAgentSession("coder", coderProjectDir)} className="px-6 py-2 bg-[#76B900] hover:bg-[#5a8f00] text-white rounded-md font-medium">Start Autonomous Coder</button>}
              <button onClick={handleNewChat} className="text-sm text-muted-foreground hover:text-foreground">← Back to Chat</button>
            </div>
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
