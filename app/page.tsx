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

  const { artifactPanelOpen, closeArtifactPanel } = useUIStore();
  const { activeSessionId, setActiveSession } = useAgentSessionsStore();

  const handleNewChat = () => {
    setActiveSession(null);
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

        {/* Unified Dory - all capabilities always available */}
        <AgentChat 
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
