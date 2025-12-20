// Main Page - Chat Interface
// Features 1, 195-214: Three-column layout with chat

"use client";

import * as React from "react";
import { useConversationStore } from "@/lib/store/conversations";
import { useUIStore, useSettingsStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { ChatMessage, TypingIndicator, MessageSkeleton } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { WelcomeScreen, type AgentType } from "@/components/chat/welcome-screen";
import { Header } from "@/components/layout/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingsModal } from "@/components/settings/settings-modal";
import { KeyboardShortcutsModal } from "@/components/settings/keyboard-shortcuts";
import { CommandPalette } from "@/components/command-palette";
import { ShareDialog } from "@/components/share-dialog";
import { ProjectSettingsPanel } from "@/components/project-settings";
import { UsageDashboard } from "@/components/usage-dashboard";
import { CoderPanel, Terminal } from "@/components/agents";
import { CLIChat } from "@/components/agents/cli-chat";
import { Monitor, Globe, Headphones, FolderOpen, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/store/conversations";

export default function ChatPage() {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [activeArtifact, setActiveArtifact] = React.useState<Artifact | null>(null);
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [streamingMetrics, setStreamingMetrics] = React.useState<{ tokensPerSec: number; totalTokens: number } | null>(null);
  const [cliMode, setCLIMode] = React.useState(true); // Default to CLI mode for agentic chat
  const streamStartRef = React.useRef<number>(0);
  const tokenCountRef = React.useRef<number>(0);

  // Store state
  const {
    getCurrentConversation,
    addMessage,
    updateMessage,
    deleteMessage,
    createConversation,
    setCurrentConversation,
    isStreaming,
    streamingContent,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
  } = useConversationStore();

  const { sidebarOpen, artifactPanelOpen, openArtifactPanel, closeArtifactPanel, setCommandPaletteOpen, setSettingsModalOpen, toggleSidebar, agentMode, setAgentMode, coderProjectDir, setCoderProjectDir } = useUIStore();
  const { apiKey, globalInstructions } = useSettingsStore();
  const { createSession, updateSession, appendOutput, activeSessionId, setActiveSession } = useAgentSessionsStore();

  const conversation = getCurrentConversation();
  const messages = conversation?.messages ?? [];

  // Show welcome when no conversation is selected
  const shouldShowWelcome = !conversation && showWelcome && agentMode === "chat";

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Reset to welcome when conversation is deleted/cleared
  React.useEffect(() => {
    if (!conversation && agentMode === "chat") {
      setShowWelcome(true);
    }
  }, [conversation, agentMode]);

  // Handle new chat - go back to welcome screen
  const handleNewChat = () => {
    setCurrentConversation(null);
    setAgentMode("chat");
    setShowWelcome(true);
  };

  // Handle agent selection from welcome screen
  const handleAgentSelect = async (agent: AgentType) => {
    if (agent === "chat") {
      setAgentMode("chat");
      setShowWelcome(false);
    } else {
      setAgentMode(agent);
      setShowWelcome(false);
    }
  };

  // Start an agent session
  const startAgentSession = async (type: AgentType, projectDir?: string) => {
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} - ${new Date().toLocaleTimeString()}`;
    const sessionId = createSession(type, name, projectDir);
    
    updateSession(sessionId, { status: "starting" });
    
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          sessionId,
          agentType: type,
          projectDir,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data: "));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status") {
              updateSession(sessionId, { status: data.status, pid: data.pid });
            } else if (data.type === "output") {
              appendOutput(sessionId, data.data);
            } else if (data.type === "exit") {
              updateSession(sessionId, { status: "stopped" });
            } else if (data.type === "error") {
              updateSession(sessionId, { status: "error", error: data.message });
            }
          } catch {}
        }
      }
    } catch (err) {
      updateSession(sessionId, { status: "error", error: (err as Error).message });
    }
  };

  // Feature 150: Global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Cmd/Ctrl + ,: Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsModalOpen(true);
      }
      // Cmd/Ctrl + /: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggleSidebar();
      }
      // Cmd/Ctrl + N: New conversation
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createConversation();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen, setSettingsModalOpen, toggleSidebar, createConversation]);

  // Feature 2: Send message with streaming
  const handleSendMessage = async (content: string, images?: string[]) => {
    let convId = conversation?.id;
    
    if (!convId) {
      // Create new conversation if none exists
      convId = createConversation();
    }

    // Get the conversation directly by ID
    const currentConv = useConversationStore.getState().conversations.find(c => c.id === convId);
    if (!currentConv) return;

    // Add user message
    const userMessageId = addMessage(convId, {
      role: "user",
      content,
      images,
    });

    // Prepare messages for API
    const apiMessages = [
      ...currentConv.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user" as const, content },
    ];

    // Start streaming
    setStreaming(true);
    clearStreamingContent();
    streamStartRef.current = Date.now();
    tokenCountRef.current = 0;
    setStreamingMetrics({ tokensPerSec: 0, totalTokens: 0 });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { "X-NVIDIA-API-Key": apiKey }),
        },
        body: JSON.stringify({
          messages: apiMessages,
          model: currentConv.model,
          temperature: currentConv.temperature,
          maxTokens: currentConv.maxTokens,
          topP: currentConv.topP,
          systemPrompt: currentConv.systemPrompt || globalInstructions || undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content" && parsed.content) {
                fullContent += parsed.content;
                appendStreamingContent(parsed.content);
                // Track tokens (~4 chars per token)
                tokenCountRef.current += Math.ceil(parsed.content.length / 4);
                const elapsed = (Date.now() - streamStartRef.current) / 1000;
                if (elapsed > 0.1) {
                  setStreamingMetrics({
                    tokensPerSec: Math.round(tokenCountRef.current / elapsed),
                    totalTokens: tokenCountRef.current,
                  });
                }
              } else if (parsed.type === "error") {
                throw new Error(parsed.error);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      // Add assistant message
      addMessage(convId, {
        role: "assistant",
        content: fullContent,
      });
    } catch (error) {
      console.error("Chat error:", error);
      // Add error message
      addMessage(convId, {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
      });
    } finally {
      setStreaming(false);
      clearStreamingContent();
      setStreamingMetrics(null);
    }
  };

  // Feature 12: Stop generation
  const handleStopGeneration = () => {
    setStreaming(false);
    // Add partial response if any
    if (streamingContent) {
      const currentConv = getCurrentConversation();
      if (currentConv) {
        addMessage(currentConv.id, {
          role: "assistant",
          content: streamingContent + "\n\n*[Generation stopped]*",
        });
      }
    }
    clearStreamingContent();
  };

  // Feature 10: Edit message
  const handleEditMessage = (messageId: string, content: string) => {
    if (conversation) {
      updateMessage(conversation.id, messageId, { content });
    }
  };

  // Feature 11: Regenerate message
  const handleRegenerateMessage = async (messageId: string) => {
    if (!conversation) return;

    // Find the message and get all messages before it
    const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Delete the message to regenerate
    deleteMessage(conversation.id, messageId);

    // Get the last user message
    const lastUserMessage = conversation.messages
      .slice(0, messageIndex)
      .reverse()
      .find((m) => m.role === "user");

    if (lastUserMessage) {
      // Resend the last user message
      await handleSendMessage(lastUserMessage.content, lastUserMessage.images);
    }
  };

  // Handle artifact click
  const handleArtifactClick = (artifact: Artifact) => {
    setActiveArtifact(artifact);
    openArtifactPanel(artifact.id);
  };

  return (
    <div className="flex h-screen bg-background relative">
      {/* Feature 182: Skip to content link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Feature 196: Sidebar column */}
      <Sidebar onNewChat={handleNewChat} />

      {/* Feature 197: Main chat column */}
      <main
        id="main-content"
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300",
          sidebarOpen ? "ml-0" : "ml-0"
        )}
      >
        {/* Feature 201: Persistent header */}
        <Header />

        {/* Content based on agent mode */}
        {agentMode === "chat" && (
          <>
            {/* CLI Mode Toggle */}
            <div className="flex items-center justify-end px-4 py-2 border-b bg-background/50">
              <button
                onClick={() => setCLIMode(!cliMode)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                  cliMode 
                    ? "bg-[#76B900] text-white" 
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <TerminalSquare className="h-4 w-4" />
                {cliMode ? "CLI Agent Mode" : "Basic Chat"}
              </button>
            </div>

            {cliMode ? (
              // CLI Agent Mode - Terminal-like interface with real tool execution
              <CLIChat projectDir={coderProjectDir || "/Users/home"} className="flex-1 min-h-0" />
            ) : (
              <>
                {/* Feature 1: Clean, centered chat layout */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {(shouldShowWelcome || (messages.length === 0 && !isStreaming)) ? (
                    // Agent selection welcome screen
                    <WelcomeScreen 
                      onAgentSelect={handleAgentSelect}
                      currentAgent={agentMode as AgentType}
                    />
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="chat-container">
                        {messages.map((message) => (
                          <ChatMessage
                            key={message.id}
                        message={message}
                        onEdit={handleEditMessage}
                        onRegenerate={handleRegenerateMessage}
                        onDelete={(id) => conversation && deleteMessage(conversation.id, id)}
                        onArtifactClick={handleArtifactClick}
                      />
                    ))}

                    {/* Streaming message */}
                    {isStreaming && streamingContent && (
                      <ChatMessage
                        message={{
                          id: "streaming",
                          role: "assistant",
                          content: streamingContent,
                          createdAt: new Date(),
                        }}
                        isStreaming
                      />
                    )}

                    {/* Feature 22: Typing indicator */}
                    {isStreaming && !streamingContent && <TypingIndicator />}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Feature 204: Bottom input area */}
            <ChatInput
              onSend={handleSendMessage}
              onStop={handleStopGeneration}
              isStreaming={isStreaming}
              disabled={!apiKey && !process.env.NEXT_PUBLIC_NVIDIA_API_KEY}
              agentMode={agentMode}
              onModeChange={setAgentMode}
              streamingMetrics={streamingMetrics}
            />
              </>
            )}
          </>
        )}

        {agentMode === "coder" && (
          <>
            {coderProjectDir ? (
              <>
                <CoderPanel projectDir={coderProjectDir} />
                <div className="border-t p-2 flex items-center gap-2 bg-background/80">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">{coderProjectDir}</code>
                  <button
                    onClick={() => startAgentSession("coder", coderProjectDir)}
                    className="px-3 py-1 text-sm bg-[#76B900] hover:bg-[#5a8f00] text-white rounded-md transition-colors"
                  >
                    Start Agent
                  </button>
                  <button
                    onClick={() => setCoderProjectDir("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
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
                <div className="flex flex-col items-center gap-3 w-full max-w-md">
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      placeholder="/Users/home/Documents/iOS"
                      value={coderProjectDir}
                      onChange={(e) => setCoderProjectDir(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md bg-background focus:border-[#76B900] outline-none transition-colors"
                    />
                    <button
                      onClick={() => {
                        // Use a simple prompt since File System Access API doesn't give full paths
                        const path = prompt("Enter the full project directory path:", "/Users/home/");
                        if (path) setCoderProjectDir(path);
                      }}
                      className="p-2 border rounded-md hover:bg-accent transition-colors"
                      title="Enter path"
                    >
                      <FolderOpen className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter the full path to your project directory
                  </p>
                  {coderProjectDir && (
                    <button
                      onClick={() => startAgentSession("coder", coderProjectDir)}
                      className="px-6 py-2 bg-[#76B900] hover:bg-[#5a8f00] text-white rounded-md transition-colors font-medium"
                    >
                      Start Autonomous Coder
                    </button>
                  )}
                </div>
                <button
                  onClick={handleNewChat}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Back to Chat
                </button>
              </div>
            )}
          </>
        )}

        {agentMode === "terminal" && (
          <div className="flex-1 p-4">
            <Terminal cwd={coderProjectDir || undefined} />
          </div>
        )}

        {/* Other agent types with start buttons */}
        {(agentMode === "computer" || agentMode === "browser" || agentMode === "research") && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br",
              agentMode === "computer" && "from-purple-500 to-purple-600",
              agentMode === "browser" && "from-orange-500 to-orange-600",
              agentMode === "research" && "from-pink-500 to-pink-600"
            )}>
              {agentMode === "computer" && <Monitor className="h-10 w-10 text-white" />}
              {agentMode === "browser" && <Globe className="h-10 w-10 text-white" />}
              {agentMode === "research" && <Headphones className="h-10 w-10 text-white" />}
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">
                {agentMode === "computer" && "Control Mode"}
                {agentMode === "browser" && "Browse Mode"}
                {agentMode === "research" && "Research Mode"}
              </h2>
              <p className="text-muted-foreground max-w-md">
                {agentMode === "computer" && "dory controls your computer to complete tasks autonomously"}
                {agentMode === "browser" && "dory navigates the web to find information and complete tasks"}
                {agentMode === "research" && "Deep research with knowledge base integration"}
              </p>
            </div>
            <button
              onClick={() => startAgentSession(agentMode as AgentType)}
              className="px-6 py-2 bg-[#76B900] hover:bg-[#5a8f00] text-white rounded-md transition-colors font-medium"
            >
              Start {agentMode === "computer" ? "Control" : agentMode === "browser" ? "Browse" : "Research"} Mode
            </button>
            <button
              onClick={handleNewChat}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Chat
            </button>
          </div>
        )}
      </main>

      {/* Feature 198: Artifact panel column */}
      {artifactPanelOpen && activeArtifact && (
        <ArtifactPanel
          artifact={activeArtifact}
          onClose={() => {
            closeArtifactPanel();
            setActiveArtifact(null);
          }}
        />
      )}

      {/* Modals */}
      <SettingsModal />
      <KeyboardShortcutsModal />
      <CommandPalette />
      <ShareDialog />
      <ProjectSettingsPanel />
      <UsageDashboard />
    </div>
  );
}
