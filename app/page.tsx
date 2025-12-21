// Main Page - Chat Interface
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { Header } from "@/components/layout/header";
import { KeyboardShortcutsModal } from "@/components/settings/keyboard-shortcuts";
import { CommandPalette } from "@/components/command-palette";
import { ShareDialog } from "@/components/share-dialog";
import { ProjectSettingsPanel } from "@/components/project-settings";
import { UsageDashboard } from "@/components/usage-dashboard";
import { AgentChat } from "@/components/agents/agent-chat";
import type { Artifact } from "@/lib/store/conversations";

export default function ChatPage() {
  const [activeArtifact, setActiveArtifact] = React.useState<Artifact | null>(null);
  const router = useRouter();

  const { sidebarOpen, artifactPanelOpen, closeArtifactPanel, toggleSidebar, agentMode, setAgentMode } = useUIStore();
  const { createSession, updateSession, appendOutput, activeSessionId, sessions, setActiveSession } = useAgentSessionsStore();

  // When clicking a session in sidebar, switch to its mode
  React.useEffect(() => {
    if (activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId);
      if (session && session.type !== agentMode) {
        setAgentMode(session.type);
      }
    }
  }, [activeSessionId, sessions, agentMode, setAgentMode]);

  const handleNewChat = () => {
    setActiveSession(null);
    setAgentMode("dory");
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only Cmd+, for settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { 
        e.preventDefault(); 
        router.push("/settings");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <div className="flex h-screen bg-background relative">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar onNewChat={handleNewChat} />

      <main id="main-content" className="flex-1 flex flex-col min-w-0">
        <Header />

        {/* Dory and Dory (Supervised) modes */}
        <AgentChat 
          mode={agentMode} 
          sessionId={activeSessionId}
          className="flex-1 min-h-0" 
        />
      </main>

      {artifactPanelOpen && activeArtifact && <ArtifactPanel artifact={activeArtifact} onClose={() => { closeArtifactPanel(); setActiveArtifact(null); }} />}

      <KeyboardShortcutsModal />
      <CommandPalette />
      <ShareDialog />
      <ProjectSettingsPanel />
      <UsageDashboard />
    </div>
  );
}
