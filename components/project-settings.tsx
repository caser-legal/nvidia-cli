// Project Settings Panel
// Features 70-77: Project configuration and settings

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore, useProjectStore } from "@/lib/store";
import { NVIDIA_MODELS, type ModelId } from "@/lib/nvidia";
import { Palette, FileText, Cpu, BarChart3, Upload, Users } from "lucide-react";

const PROJECT_COLORS = [
  "#76B900", "#3B82F6", "#EF4444", "#F59E0B", "#10B981",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316",
];

export function ProjectSettingsPanel() {
  const { projectSettingsOpen, setProjectSettingsOpen } = useUIStore();
  const { getCurrentProject, updateProject } = useProjectStore();
  const project = getCurrentProject();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("#76B900");
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [defaultModel, setDefaultModel] = React.useState<ModelId>("nvidia/nemotron-3-nano");

  // Load project data
  React.useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || "");
      setColor(project.color);
      setCustomInstructions(project.customInstructions || "");
      setDefaultModel(project.defaultModel);
    }
  }, [project]);

  const handleSave = () => {
    if (project) {
      updateProject(project.id, {
        name,
        description,
        color,
        customInstructions,
        defaultModel,
      });
      setProjectSettingsOpen(false);
    }
  };

  if (!project) return null;

  // Mock usage stats
  const usageStats = {
    conversations: 12,
    messages: 156,
    tokens: 45230,
  };

  return (
    <Dialog open={projectSettingsOpen} onOpenChange={setProjectSettingsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this project..."
                className="min-h-[80px]"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            {/* Default Model */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Default Model
              </label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value as ModelId)}
                className="w-full p-2 border rounded-md bg-background"
              >
                {Object.entries(NVIDIA_MODELS).map(([id, model]) => (
                  <option key={id} value={id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Instructions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Instructions</label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Custom instructions for this project..."
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                These instructions will be included in all conversations within this project.
              </p>
            </div>

            {/* Knowledge Base (Mock) */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Knowledge Base
              </label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop files or click to upload
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, TXT, MD files supported
                </p>
              </div>
            </div>

            {/* Team Sharing (Mock) */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Sharing
              </label>
              <Button variant="outline" className="w-full" disabled>
                <Users className="h-4 w-4 mr-2" />
                Invite Team Members (Coming Soon)
              </Button>
            </div>

            {/* Usage Stats */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Usage Statistics
              </label>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{usageStats.conversations}</div>
                  <div className="text-xs text-muted-foreground">Conversations</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{usageStats.messages}</div>
                  <div className="text-xs text-muted-foreground">Messages</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{(usageStats.tokens / 1000).toFixed(1)}k</div>
                  <div className="text-xs text-muted-foreground">Tokens</div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={() => setProjectSettingsOpen(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
