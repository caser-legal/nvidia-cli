// Coder Setup Screen
// Select project directory and task type before starting autonomous coder

"use client";

import * as React from "react";
import { FolderOpen, FileText, Play, TestTube, Wrench, Sparkles, Code } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type CoderTask = "spec" | "continue" | "qa" | "refactor" | "custom";

interface CoderSetupProps {
  onStart: (projectDir: string, task: CoderTask, customPrompt?: string) => void;
}

const TASKS = [
  {
    id: "spec" as CoderTask,
    name: "Create App Spec",
    description: "Generate a detailed specification and feature list",
    icon: FileText,
  },
  {
    id: "continue" as CoderTask,
    name: "Continue Work",
    description: "Pick up where you left off, implement next features",
    icon: Play,
  },
  {
    id: "qa" as CoderTask,
    name: "QA & Test",
    description: "Run tests, find bugs, verify implementations",
    icon: TestTube,
  },
  {
    id: "refactor" as CoderTask,
    name: "Refactor & Improve",
    description: "Clean up code, improve performance, fix issues",
    icon: Wrench,
  },
  {
    id: "custom" as CoderTask,
    name: "Custom Task",
    description: "Describe what you want to build or fix",
    icon: Sparkles,
  },
];

export function CoderSetup({ onStart }: CoderSetupProps) {
  const [projectDir, setProjectDir] = React.useState("/Users/home/");
  const [selectedTask, setSelectedTask] = React.useState<CoderTask | null>(null);
  const [customPrompt, setCustomPrompt] = React.useState("");

  const handleStart = () => {
    if (!projectDir || !selectedTask) return;
    onStart(projectDir, selectedTask, selectedTask === "custom" ? customPrompt : undefined);
  };

  const canStart = projectDir && selectedTask && (selectedTask !== "custom" || customPrompt.trim());

  return (
    <div className={cn("flex flex-col h-full bg-[#1a1a1a] text-white font-mono")}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-[#252525]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <div className="flex items-center gap-2 ml-2">
          <Code className="h-4 w-4 text-blue-400" />
          <span className="text-sm text-blue-400">Coder Mode</span>
        </div>
      </div>

      {/* Output area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {/* Welcome */}
          <div className="text-gray-500">
            <div className="text-blue-400 mb-2">Autonomous Coder</div>
            <div>Build entire apps from start to finish. Watch it work.</div>
            <div className="pl-4 text-gray-600 mt-2">
              <div>• Never overflows context window</div>
              <div>• Never gets dumb—compact memory across sessions</div>
              <div>• Never say &quot;just do it&quot; again</div>
              <div>• Picks up exactly where it left off, everytime</div>
            </div>
          </div>

          {/* Project Directory */}
          <div className="mt-6 text-gray-400">Where should I work?</div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-blue-400">❯</span>
            <input
              type="text"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              placeholder="/Users/home/my-project"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600"
            />
            <button
              onClick={() => {
                const p = prompt("Enter project path:", projectDir);
                if (p) setProjectDir(p);
              }}
              className="text-gray-500 hover:text-white"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          </div>

          {/* Task Selection */}
          <div className="text-gray-400 mt-4">What should I do?</div>
          <div className="space-y-1 mt-2">
            {TASKS.map((task) => {
              const Icon = task.icon;
              const isSelected = selectedTask === task.id;
              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left rounded transition-colors",
                    isSelected ? "bg-blue-500/20 text-blue-400" : "hover:bg-gray-800 text-gray-400"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={isSelected ? "text-blue-400" : "text-gray-300"}>{task.name}</div>
                    <div className="text-xs text-gray-600 truncate">{task.description}</div>
                  </div>
                  {isSelected && <span className="text-blue-400">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Custom prompt */}
          {selectedTask === "custom" && (
            <div className="mt-4">
              <div className="text-gray-400 mb-2">Describe the task:</div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">❯</span>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Build a REST API with user authentication..."
                  rows={3}
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 resize-none"
                />
              </div>
            </div>
          )}

          {/* Start hint */}
          {canStart && (
            <div className="mt-6 text-gray-400">
              <span className="text-green-400">Ready.</span> Press Enter or{" "}
              <button onClick={handleStart} className="text-blue-400 hover:underline">
                click here
              </button>{" "}
              to start.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <form onSubmit={(e) => { e.preventDefault(); if (canStart) handleStart(); }} className="border-t border-gray-800 p-4 bg-[#252525]">
        <div className="flex items-center gap-2">
          <span className="text-blue-400">❯</span>
          <input
            type="text"
            placeholder={canStart ? "Press Enter to start..." : "Select a task above..."}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600"
            onKeyDown={(e) => { if (e.key === "Enter" && canStart) handleStart(); }}
            readOnly
          />
        </div>
      </form>
    </div>
  );
}
