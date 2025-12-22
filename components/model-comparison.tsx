// Model Comparison Component
// Features 89, 91: Model comparison and pricing info

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/store";
import { NVIDIA_MODELS, type ModelId } from "@/lib/nvidia";
import { Check, X, Zap, Brain, Eye, Code } from "lucide-react";

// Feature 89: Model pricing info (free tier)
const MODEL_PRICING: Record<string, { input: string; output: string; limit: string }> = {
  "nvidia/nemotron-3-nano-30b-a3b": { input: "Free", output: "Free", limit: "40 RPM" },
  "nvidia/llama-3.2-nv-embedqa-1b-v2": { input: "Free", output: "Free", limit: "40 RPM" },
  "nvidia/llama-3.2-nv-rerankqa-1b-v2": { input: "Free", output: "Free", limit: "40 RPM" },
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": { input: "Free", output: "Free", limit: "40 RPM" },
};

export function ModelComparisonDialog() {
  const { modelComparisonOpen, setModelComparisonOpen } = useUIStore();

  const models = Object.entries(NVIDIA_MODELS);

  return (
    <Dialog open={modelComparisonOpen} onOpenChange={setModelComparisonOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Model Comparison</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-center p-3 font-medium">Context</th>
                  <th className="text-center p-3 font-medium">Streaming</th>
                  <th className="text-center p-3 font-medium">Vision</th>
                  <th className="text-center p-3 font-medium">Tools</th>
                  <th className="text-center p-3 font-medium">Reasoning</th>
                  <th className="text-right p-3 font-medium">Rate Limit</th>
                </tr>
              </thead>
              <tbody>
                {models.map(([id, model]) => {
                  const pricing = MODEL_PRICING[id as keyof typeof MODEL_PRICING];
                  return (
                    <tr key={id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{id.split("/")[0]}</div>
                      </td>
                      <td className="text-center p-3">
                        <span className="text-xs bg-muted px-2 py-1 rounded">
                          {(model.contextWindow / 1000).toFixed(0)}K
                        </span>
                      </td>
                      <td className="text-center p-3">
                        {model.supportsStreaming ? (
                          <Check className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-center p-3">
                        {model.supportsImages ? (
                          <Eye className="h-4 w-4 text-blue-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-center p-3">
                        {model.supportsTools ? (
                          <Code className="h-4 w-4 text-purple-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-center p-3">
                        {id.includes("deepseek-r1") || id.includes("nemotron-super") ? (
                          <Brain className="h-4 w-4 text-orange-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-right p-3">
                        <span className="text-xs text-muted-foreground">
                          {pricing?.limit || "40 RPM"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Legend</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span>Streaming</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                <span>Vision/Image Input</span>
              </div>
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-purple-500" />
                <span>Function Calling</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-orange-500" />
                <span>Reasoning Mode</span>
              </div>
            </div>
          </div>

          {/* Pricing Note */}
          <div className="mt-4 p-4 border rounded-lg">
            <h4 className="font-medium mb-2">Pricing</h4>
            <p className="text-sm text-muted-foreground">
              All models are available on the NVIDIA free tier with a rate limit of 40 requests per minute.
              For higher limits and production use, visit{" "}
              <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-primary underline">
                build.nvidia.com
              </a>
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
