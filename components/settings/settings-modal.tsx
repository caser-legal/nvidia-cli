// Settings Modal Component - Simplified

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsStore, useUIStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { Sun, Moon, Monitor, Eye, EyeOff, Key, Terminal } from "lucide-react";

export function SettingsModal() {
  const { settingsModalOpen, setSettingsModalOpen } = useUIStore();
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    codeTheme,
    setCodeTheme,
  } = useSettingsStore();
  const { sessions } = useAgentSessionsStore();

  const [showApiKey, setShowApiKey] = React.useState(false);
  const [localApiKey, setLocalApiKey] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  // Load current API key on mount
  React.useEffect(() => {
    fetch("/api/settings/api-key")
      .then(res => res.json())
      .then(data => {
        if (data.apiKey) setLocalApiKey(data.apiKey);
      })
      .catch(() => {});
  }, []);

  const handleSaveApiKey = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: localApiKey }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  };

  // Calculate stats from sessions
  const stats = React.useMemo(() => {
    let totalTokens = 0;
    let totalRequests = sessions.length;
    
    sessions.forEach(session => {
      session.output?.forEach(out => {
        try {
          const event = JSON.parse(out);
          if (event.type === "metrics" && event.totalTokens) {
            totalTokens += event.totalTokens;
          }
        } catch {}
      });
    });
    
    return { totalTokens, totalRequests };
  }, [sessions]);

  return (
    <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-6 pr-4">
              {/* Theme Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Theme</label>
                <div className="flex gap-2">
                  {[
                    { value: "light", icon: Sun, label: "Light" },
                    { value: "dark", icon: Moon, label: "Dark" },
                    { value: "system", icon: Monitor, label: "System" },
                  ].map(({ value, icon: Icon, label }) => (
                    <Button
                      key={value}
                      variant={theme === value ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTheme(value as "light" | "dark" | "system")}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Font Size</label>
                <div className="flex gap-2">
                  {["small", "medium", "large"].map((size) => (
                    <Button
                      key={size}
                      variant={fontSize === size ? "default" : "outline"}
                      className="flex-1 capitalize"
                      onClick={() => setFontSize(size as "small" | "medium" | "large")}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Code Theme */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Code Theme</label>
                <div className="flex gap-2">
                  {["oneDark", "github", "dracula"].map((ct) => (
                    <Button
                      key={ct}
                      variant={codeTheme === ct ? "default" : "outline"}
                      className="flex-1 capitalize"
                      onClick={() => setCodeTheme(ct as "oneDark" | "github" | "dracula")}
                    >
                      {ct}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium">Keyboard Shortcuts</label>
                <div className="text-xs text-muted-foreground space-y-1 font-mono bg-muted/50 p-3 rounded">
                  <div className="flex justify-between"><span>Open Settings</span><kbd className="bg-background px-1.5 py-0.5 rounded">⌘ ,</kbd></div>
                  <div className="flex justify-between"><span>Send Message</span><kbd className="bg-background px-1.5 py-0.5 rounded">Enter</kbd></div>
                  <div className="flex justify-between"><span>New Line</span><kbd className="bg-background px-1.5 py-0.5 rounded">Shift + Enter</kbd></div>
                  <div className="flex justify-between"><span>Clear Input</span><kbd className="bg-background px-1.5 py-0.5 rounded">Ctrl + U</kbd></div>
                </div>
              </div>
            </TabsContent>

            {/* API Tab */}
            <TabsContent value="api" className="space-y-6 pr-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  NVIDIA API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                      placeholder="nvapi-..."
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button 
                    onClick={handleSaveApiKey}
                    disabled={saveStatus === "saving"}
                  >
                    {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updates .env.local file. Get your key from{" "}
                  <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-primary underline">
                    build.nvidia.com
                  </a>
                </p>
              </div>

              {/* Model Info */}
              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium">Active Model</label>
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <div className="font-medium">Nemotron 3 Nano 30B</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    128K context • 3.5B active params • Hybrid MoE
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Usage Tab */}
            <TabsContent value="usage" className="space-y-6 pr-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total Tokens</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{stats.totalRequests}</div>
                  <div className="text-xs text-muted-foreground">Conversations</div>
                </div>
              </div>

              {/* Running Log */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Recent Activity
                </label>
                <ScrollArea className="h-[200px] rounded-lg border bg-black/90 p-3">
                  <div className="font-mono text-xs text-green-400 space-y-1">
                    {sessions.length === 0 ? (
                      <div className="text-gray-500">No activity yet</div>
                    ) : (
                      sessions.slice(0, 20).map((session, i) => {
                        const date = new Date(session.createdAt);
                        const time = date.toLocaleTimeString();
                        return (
                          <div key={session.id} className="flex gap-2">
                            <span className="text-gray-500">[{time}]</span>
                            <span className={session.status === "running" ? "text-yellow-400" : "text-green-400"}>
                              {session.status === "running" ? "●" : "✓"}
                            </span>
                            <span className="text-white truncate">{session.name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Tools Available */}
              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium">Available Tools (24)</label>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                  {["set_project", "get_project", "file_read", "file_write", "bash", "think", "memory", "entity_memory", "google_search", "tavily_search", "parallel_search", "parallel_tavily_search", "local_docs_search", "github_analyzer", "github_file_reader", "code_documentation", "mermaid_generator", "quick_diagram", "rag_ingest", "rag_search", "rag_query", "rag_research", "rag_stats", "rag_clear"].map(tool => (
                    <span key={tool} className="px-1.5 py-0.5 bg-muted rounded">{tool}</span>
                  ))}
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
