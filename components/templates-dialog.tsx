// Templates Component
// Features 76, 98, 137: Project, instruction, and conversation templates

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUIStore, useProjectStore } from "@/lib/store";
import { useConversationStore } from "@/lib/store/conversations";
import { FolderOpen, MessageSquare, FileText, Plus, Search } from "lucide-react";

// Feature 76: Project templates
const PROJECT_TEMPLATES = [
  {
    id: "coding",
    name: "Coding Assistant",
    description: "Help with programming tasks",
    instructions: "You are an expert programmer. Help with code reviews, debugging, and writing clean, efficient code. Always explain your reasoning.",
    color: "#3B82F6",
  },
  {
    id: "writing",
    name: "Writing Helper",
    description: "Assist with writing and editing",
    instructions: "You are a skilled writer and editor. Help improve clarity, grammar, and style. Provide constructive feedback.",
    color: "#10B981",
  },
  {
    id: "research",
    name: "Research Assistant",
    description: "Help with research and analysis",
    instructions: "You are a thorough researcher. Help analyze information, summarize findings, and provide well-sourced insights.",
    color: "#8B5CF6",
  },
  {
    id: "brainstorm",
    name: "Brainstorming Partner",
    description: "Generate creative ideas",
    instructions: "You are a creative thinking partner. Help generate ideas, explore possibilities, and think outside the box.",
    color: "#F59E0B",
  },
];

// Feature 98: Custom instruction templates
const INSTRUCTION_TEMPLATES = [
  {
    id: "concise",
    name: "Concise Responses",
    content: "Be concise and direct. Avoid unnecessary explanations unless asked.",
  },
  {
    id: "detailed",
    name: "Detailed Explanations",
    content: "Provide thorough explanations with examples. Break down complex topics step by step.",
  },
  {
    id: "code-focused",
    name: "Code-Focused",
    content: "Focus on code examples. Use comments to explain. Prefer practical implementations over theory.",
  },
  {
    id: "socratic",
    name: "Socratic Method",
    content: "Guide through questions rather than direct answers. Help develop understanding through inquiry.",
  },
];

// Feature 137: Conversation templates
const CONVERSATION_TEMPLATES = [
  {
    id: "code-review",
    name: "Code Review",
    firstMessage: "I'd like you to review my code. Please check for bugs, performance issues, and suggest improvements.",
  },
  {
    id: "explain",
    name: "Explain Concept",
    firstMessage: "Can you explain [concept] in simple terms? I'm trying to understand how it works.",
  },
  {
    id: "debug",
    name: "Debug Issue",
    firstMessage: "I'm having an issue with my code. Here's the error message and relevant code:",
  },
  {
    id: "compare",
    name: "Compare Options",
    firstMessage: "Can you compare [option A] vs [option B]? What are the pros and cons of each?",
  },
];

export function TemplatesDialog() {
  const { templatesDialogOpen, setTemplatesDialogOpen } = useUIStore();
  const { createProject } = useProjectStore();
  const { createConversation, addMessage } = useConversationStore();
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleUseProjectTemplate = (template: typeof PROJECT_TEMPLATES[0]) => {
    createProject(template.name);
    setTemplatesDialogOpen(false);
  };

  const handleUseConversationTemplate = (template: typeof CONVERSATION_TEMPLATES[0]) => {
    const convId = createConversation();
    // Note: In a real implementation, you'd set the first message
    setTemplatesDialogOpen(false);
  };

  return (
    <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs defaultValue="projects">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="projects">
              <FolderOpen className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="instructions">
              <FileText className="h-4 w-4 mr-2" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="conversations">
              <MessageSquare className="h-4 w-4 mr-2" />
              Conversations
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {/* Project Templates */}
            <TabsContent value="projects" className="space-y-3">
              {PROJECT_TEMPLATES.filter(t => 
                t.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((template) => (
                <div
                  key={template.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleUseProjectTemplate(template)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: template.color }}
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{template.name}</h4>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Instruction Templates */}
            <TabsContent value="instructions" className="space-y-3">
              {INSTRUCTION_TEMPLATES.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((template) => (
                <div
                  key={template.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <h4 className="font-medium mb-1">{template.name}</h4>
                  <p className="text-sm text-muted-foreground">{template.content}</p>
                </div>
              ))}
            </TabsContent>

            {/* Conversation Templates */}
            <TabsContent value="conversations" className="space-y-3">
              {CONVERSATION_TEMPLATES.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((template) => (
                <div
                  key={template.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleUseConversationTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{template.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {template.firstMessage}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
