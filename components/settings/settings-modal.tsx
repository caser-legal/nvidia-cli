// Settings Modal Component
// Features 103-117: Settings with tabs

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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsStore, useUIStore } from "@/lib/store";
import { Sun, Moon, Monitor, Eye, EyeOff, Keyboard, Download, Shield, Key } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsModal() {
  const { settingsModalOpen, setSettingsModalOpen, setKeyboardShortcutsOpen } = useUIStore();
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    messageDensity,
    setMessageDensity,
    codeTheme,
    setCodeTheme,
    apiKey,
    setApiKey,
    globalInstructions,
    setGlobalInstructions,
    reducedMotion,
    setReducedMotion,
    highContrast,
    setHighContrast,
  } = useSettingsStore();

  const [showApiKey, setShowApiKey] = React.useState(false);
  const [localApiKey, setLocalApiKey] = React.useState(apiKey || "");

  const handleSaveApiKey = () => {
    setApiKey(localApiKey);
  };

  const handleExportData = () => {
    const data = {
      settings: {
        theme,
        fontSize,
        messageDensity,
        codeTheme,
        globalInstructions,
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nvidia-cli-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {/* Appearance Tab - Features 103-112 */}
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

              {/* Message Density */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Message Density</label>
                <div className="flex gap-2">
                  {["compact", "comfortable", "spacious"].map((density) => (
                    <Button
                      key={density}
                      variant={messageDensity === density ? "default" : "outline"}
                      className="flex-1 capitalize"
                      onClick={() => setMessageDensity(density as "compact" | "comfortable" | "spacious")}
                    >
                      {density}
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

              {/* Accessibility */}
              <div className="space-y-4">
                <label className="text-sm font-medium">Accessibility</label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Reduced Motion</span>
                  <Button
                    variant={reducedMotion ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReducedMotion(!reducedMotion)}
                  >
                    {reducedMotion ? "On" : "Off"}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">High Contrast</span>
                  <Button
                    variant={highContrast ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHighContrast(!highContrast)}
                  >
                    {highContrast ? "On" : "Off"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* API Tab - Feature 116 */}
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
                  <Button onClick={handleSaveApiKey}>Save</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-primary underline">
                    build.nvidia.com
                  </a>
                </p>
              </div>
            </TabsContent>

            {/* Instructions Tab - Features 95-102 */}
            <TabsContent value="instructions" className="space-y-6 pr-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Global Custom Instructions</label>
                <Textarea
                  value={globalInstructions}
                  onChange={(e) => setGlobalInstructions(e.target.value)}
                  placeholder="Add custom instructions that will be included in all conversations..."
                  className="min-h-[200px]"
                />
                <p className="text-xs text-muted-foreground">
                  These instructions will be prepended to every conversation as a system message.
                </p>
              </div>
            </TabsContent>

            {/* Data Tab - Feature 114-115 */}
            <TabsContent value="data" className="space-y-6 pr-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Export Data</label>
                  <Button onClick={handleExportData} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Export Settings
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Keyboard Shortcuts</label>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSettingsModalOpen(false);
                      setKeyboardShortcutsOpen(true);
                    }}
                  >
                    <Keyboard className="h-4 w-4 mr-2" />
                    View Shortcuts
                  </Button>
                </div>

                {/* Feature 115: Privacy Settings */}
                <div className="space-y-4 pt-4 border-t">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Privacy Settings
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm">Save conversation history</span>
                        <p className="text-xs text-muted-foreground">Store conversations locally</p>
                      </div>
                      <Button variant="outline" size="sm">On</Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm">Analytics</span>
                        <p className="text-xs text-muted-foreground">Help improve the app</p>
                      </div>
                      <Button variant="outline" size="sm">Off</Button>
                    </div>
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => {
                        if (confirm("Are you sure you want to clear ALL data? This will delete all conversations, settings, and agent sessions. This cannot be undone.")) {
                          // Clear all localStorage keys
                          localStorage.removeItem('nvidia-cli-conversations');
                          localStorage.removeItem('nvidia-agent-sessions');
                          localStorage.removeItem('nvidia-cli-projects');
                          localStorage.removeItem('nvidia-cli-folders');
                          localStorage.removeItem('nvidia-cli-settings');
                          localStorage.removeItem('nvidia-cli-ui');
                          localStorage.removeItem('nvidia-cli-usage');
                          localStorage.removeItem('nvidia-cli-prompts');
                          // Reload the page
                          window.location.reload();
                        }
                      }}
                    >
                      Clear All Data
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
