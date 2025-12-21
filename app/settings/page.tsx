// Settings Page

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useSettingsStore } from "@/lib/store";
import { useAgentSessionsStore } from "@/lib/store/agent-sessions";
import { 
  Sun, Moon, Monitor, Eye, EyeOff, Key, Terminal, ChevronDown, ChevronRight,
  ArrowLeft, RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

// Tool definitions with full documentation
const TOOLS = [
  {
    name: "set_project",
    path: "lib/agents/tools/project.ts",
    category: "Project",
    description: "Sets the current working directory for all file and bash operations.",
    howItWorks: "Updates a global variable that file_read, file_write, and bash tools use as their base path. Validates the directory exists before setting.",
    example: 'set_project({ path: "/Users/home/Documents/MyApp" })',
  },
  {
    name: "get_project", 
    path: "lib/agents/tools/project.ts",
    category: "Project",
    description: "Returns the current working directory path.",
    howItWorks: "Simply returns the global project directory variable. Useful for confirming which project you're working in.",
    example: "get_project()",
  },
  {
    name: "file_read",
    path: "lib/agents/tools/file-read.ts", 
    category: "File System",
    description: "Reads file contents or lists directory contents.",
    howItWorks: "Uses Node.js fs module to read files. Supports 'read' operation for file contents and 'list' operation for directory listings. Paths are resolved relative to the current project directory.",
    example: 'file_read({ operation: "list", path: "." })',
  },
  {
    name: "file_write",
    path: "lib/agents/tools/file-write.ts",
    category: "File System", 
    description: "Creates, overwrites, or edits files.",
    howItWorks: "Uses Node.js fs module. 'write' operation creates/overwrites entire file. 'edit' operation does find-and-replace within existing file.",
    example: 'file_write({ operation: "write", path: "hello.txt", content: "Hello World" })',
  },
  {
    name: "bash",
    path: "lib/agents/tools/bash.ts",
    category: "System",
    description: "Executes shell commands on your system.",
    howItWorks: "Uses Node.js child_process.exec() to run commands. Executes in the current project directory. Returns stdout/stderr output.",
    example: 'bash({ command: "ls -la" })',
  },
  {
    name: "think",
    path: "lib/agents/tools/think.ts",
    category: "Reasoning",
    description: "Internal reasoning tool for complex problem solving.",
    howItWorks: "Allows the agent to 'think out loud' and break down complex problems into steps before taking action.",
    example: 'think({ thought: "I need to first check if the file exists..." })',
  },
  {
    name: "memory",
    path: "lib/agents/tools/memory.ts",
    category: "Memory",
    description: "Stores and retrieves information across conversations.",
    howItWorks: "Short-term memory is session-based (RAM). Long-term memory persists to ~/.nvidia-cli/memory.json file.",
    example: 'memory({ operation: "store", key: "user_preference", value: "dark mode" })',
  },
  {
    name: "entity_memory",
    path: "lib/agents/tools/memory.ts",
    category: "Memory",
    description: "Tracks entities like people, projects, companies, and technologies.",
    howItWorks: "Specialized memory that categorizes and links related entities. Helps maintain context about things you frequently discuss.",
    example: 'entity_memory({ operation: "add", type: "project", name: "MyApp", details: "iOS app" })',
  },
  {
    name: "google_search",
    path: "lib/agents/tools/google-search.ts",
    category: "Search",
    description: "Searches Google for information.",
    howItWorks: "Uses Google Custom Search API. Requires GOOGLE_API_KEY and GOOGLE_CSE_ID in environment. Returns top search results with titles, snippets, and URLs.",
    example: 'google_search({ query: "Swift async await tutorial" })',
  },
  {
    name: "tavily_search",
    path: "lib/agents/tools/tavily-search.ts",
    category: "Search",
    description: "Optimized web search with full content extraction.",
    howItWorks: "Uses Tavily API designed for intelligent assistants. Returns more detailed content than Google, including full page text extraction. Better for research tasks.",
    example: 'tavily_search({ query: "iOS 18 new features", topic: "general" })',
  },
  {
    name: "parallel_search",
    path: "lib/agents/tools/parallel-search.ts",
    category: "Search",
    description: "Runs multiple Google searches simultaneously.",
    howItWorks: "Takes an array of queries and executes them in parallel using Promise.all(). Faster than sequential searches for multi-topic research.",
    example: 'parallel_search({ queries: ["SwiftUI", "UIKit", "Combine framework"] })',
  },
  {
    name: "parallel_tavily_search",
    path: "lib/agents/tools/tavily-search.ts",
    category: "Search",
    description: "Runs multiple Tavily searches simultaneously.",
    howItWorks: "Same as parallel_search but uses Tavily API for deeper content extraction.",
    example: 'parallel_tavily_search({ queries: ["React hooks", "Vue composition API"] })',
  },
  {
    name: "local_docs_search",
    path: "lib/agents/tools/local-docs-search.ts",
    category: "Search",
    description: "Searches local documentation files.",
    howItWorks: "Scans markdown and text files in your project for keyword matches. Useful for finding information in your own docs without web search.",
    example: 'local_docs_search({ query: "authentication" })',
  },
  {
    name: "github_analyzer",
    path: "lib/agents/tools/github-analyzer.ts",
    category: "Code",
    description: "Clones and analyzes GitHub repositories.",
    howItWorks: "Clones repo to temp directory, analyzes file structure, identifies languages, counts lines of code, and extracts key information.",
    example: 'github_analyzer({ operation: "analyze", repo_url: "https://github.com/user/repo" })',
  },
  {
    name: "github_file_reader",
    path: "lib/agents/tools/github-analyzer.ts",
    category: "Code",
    description: "Reads specific files from cloned GitHub repos.",
    howItWorks: "After github_analyzer clones a repo, this tool reads individual files from the cloned copy.",
    example: 'github_file_reader({ repo: "user/repo", path: "README.md" })',
  },
  {
    name: "code_documentation",
    path: "lib/agents/tools/code-documentation.ts",
    category: "Code",
    description: "Generates documentation for codebases.",
    howItWorks: "Analyzes code structure and generates README, API docs, or architecture documentation using the LLM (Large Language Model).",
    example: 'code_documentation({ type: "readme", path: "." })',
  },
  {
    name: "mermaid_generator",
    path: "lib/agents/tools/mermaid-generator.ts",
    category: "Diagrams",
    description: "Creates Mermaid diagrams for architecture visualization.",
    howItWorks: "Mermaid is a text-based diagramming language. This tool generates flowcharts, sequence diagrams, and architecture diagrams from descriptions.",
    example: 'mermaid_generator({ type: "flowchart", description: "User login flow" })',
  },
  {
    name: "quick_diagram",
    path: "lib/agents/tools/mermaid-generator.ts",
    category: "Diagrams",
    description: "Fast diagram generation using templates.",
    howItWorks: "Pre-built templates for common diagram types. Faster than mermaid_generator for standard patterns.",
    example: 'quick_diagram({ template: "api_flow" })',
  },
  {
    name: "rag_ingest",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Ingests documents into the RAG (Retrieval-Augmented Generation) system.",
    howItWorks: "RAG lets Dory search your documents. This tool converts documents into embeddings (numerical representations) and stores them in a vector database for semantic search.",
    example: 'rag_ingest({ path: "./docs" })',
  },
  {
    name: "rag_search",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Searches ingested documents using semantic similarity.",
    howItWorks: "Converts your query to an embedding and finds documents with similar meaning, not just keyword matches. Uses NVIDIA embeddings model.",
    example: 'rag_search({ query: "how to authenticate users" })',
  },
  {
    name: "rag_query",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Asks questions about ingested documents.",
    howItWorks: "Combines rag_search with LLM to answer questions. Retrieves relevant docs, then generates an answer based on them.",
    example: 'rag_query({ question: "What authentication methods are supported?" })',
  },
  {
    name: "rag_research",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Deep research using RAG with query decomposition.",
    howItWorks: "Breaks complex questions into sub-questions, searches for each, then synthesizes a comprehensive answer. Based on NVIDIA AIQ Research Assistant pattern.",
    example: 'rag_research({ topic: "Compare REST vs GraphQL for mobile apps" })',
  },
  {
    name: "rag_stats",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Shows statistics about the RAG database.",
    howItWorks: "Returns count of ingested documents, total chunks, and storage size.",
    example: "rag_stats()",
  },
  {
    name: "rag_clear",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Clears all documents from the RAG database.",
    howItWorks: "Removes all embeddings and document chunks. Use when you want to start fresh.",
    example: "rag_clear()",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const {
    fontSize,
    setFontSize,
    codeTheme,
    setCodeTheme,
  } = useSettingsStore();
  const { sessions } = useAgentSessionsStore();

  const [mounted, setMounted] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [localApiKey, setLocalApiKey] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [expandedTool, setExpandedTool] = React.useState<string | null>(null);
  const [statsResetDate, setStatsResetDate] = React.useState<string>(new Date().toISOString());

  // Hydration fix
  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("statsResetDate");
    if (saved) setStatsResetDate(saved);
  }, []);

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

  const handleResetStats = () => {
    const now = new Date().toISOString();
    setStatsResetDate(now);
    localStorage.setItem("statsResetDate", now);
  };

  // Calculate stats from sessions since reset date
  const stats = React.useMemo(() => {
    let totalTokens = 0;
    let totalRequests = 0;
    const resetTime = new Date(statsResetDate).getTime();
    
    sessions.forEach(session => {
      if (new Date(session.createdAt).getTime() >= resetTime) {
        totalRequests++;
        session.output?.forEach(out => {
          try {
            const event = JSON.parse(out);
            if (event.type === "metrics" && event.totalTokens) {
              totalTokens += event.totalTokens;
            }
          } catch {}
        });
      }
    });
    
    return { totalTokens, totalRequests };
  }, [sessions, statsResetDate]);

  const groupedTools = React.useMemo(() => {
    const groups: Record<string, typeof TOOLS> = {};
    TOOLS.forEach(tool => {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    });
    return groups;
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto p-6 space-y-8">
            
            {/* Appearance Section */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">Appearance</h2>
              
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
                      variant={mounted && theme === value ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTheme(value as "light" | "dark" | "system")}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

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
            </section>

            {/* API Section */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">API Configuration</h2>
              
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
                  <Button onClick={handleSaveApiKey} disabled={saveStatus === "saving"}>
                    {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Saves to .env.local file. Restart server after changing. Get your key from{" "}
                  <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-primary underline">
                    build.nvidia.com
                  </a>
                </p>
              </div>

              {/* Model Info */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="font-medium">Active Model: Nemotron 3 Nano 30B</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>NIM</strong> (NVIDIA Inference Microservices) - NVIDIA's cloud API for running language models.</p>
                  <p><strong>MoE</strong> (Mixture of Experts) - Architecture where only some "expert" networks activate per request, making it faster. This model has 30B total parameters but only 3.5B activate per token.</p>
                  <p><strong>Context Window:</strong> 128K tokens (~100,000 words) - how much text the model can "see" at once.</p>
                </div>
              </div>
            </section>

            {/* Usage Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-lg font-semibold">Usage Statistics</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Since {new Date(statsResetDate).toLocaleDateString()}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleResetStats}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total Tokens</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Tokens are pieces of text (roughly 4 characters each). This counts all input and output tokens used.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{stats.totalRequests}</div>
                  <div className="text-xs text-muted-foreground">Conversations</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Number of chat sessions started since the reset date.
                  </p>
                </div>
              </div>

              {/* Activity Log */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Recent Activity
                </label>
                <ScrollArea className="h-[400px] rounded-lg border bg-black/90 p-3">
                  <div className="font-mono text-xs text-green-400 space-y-1">
                    {sessions.length === 0 ? (
                      <div className="text-gray-500">No activity yet</div>
                    ) : (
                      sessions.slice(0, 60).map((session) => {
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
            </section>

            {/* Tools Section */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">Available Tools ({TOOLS.length})</h2>
              <p className="text-sm text-muted-foreground">
                These are the capabilities Dory has access to. Click any tool to learn more about how it works.
              </p>
              
              {Object.entries(groupedTools).map(([category, tools]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{category}</h3>
                  <div className="space-y-1">
                    {tools.map(tool => (
                      <div key={tool.name} className="border rounded-lg overflow-hidden">
                        <button
                          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 text-left"
                          onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                        >
                          {expandedTool === tool.name ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <code className="text-sm font-mono text-primary">{tool.name}</code>
                          <span className="text-xs text-muted-foreground truncate">{tool.description}</span>
                        </button>
                        
                        {expandedTool === tool.name && (
                          <div className="px-4 py-3 bg-muted/30 border-t space-y-3 text-sm">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">FILE PATH</div>
                              <code className="text-xs bg-muted px-2 py-1 rounded">{tool.path}</code>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">WHAT IT DOES</div>
                              <p>{tool.description}</p>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">HOW IT WORKS</div>
                              <p className="text-muted-foreground">{tool.howItWorks}</p>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">EXAMPLE</div>
                              <code className="text-xs bg-black/80 text-green-400 px-2 py-1 rounded block">{tool.example}</code>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* Keyboard Shortcuts */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">Keyboard Shortcuts</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Open Settings</span>
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">⌘ ,</kbd>
                </div>
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Send Message</span>
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">Enter</kbd>
                </div>
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>New Line in Input</span>
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">Shift + Enter</kbd>
                </div>
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Clear Input</span>
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">Ctrl + U</kbd>
                </div>
              </div>
            </section>

            {/* About */}
            <section className="space-y-6 pb-8">
              <h2 className="text-lg font-semibold border-b pb-2">About Dory</h2>
              
              <div className="space-y-4">
                {/* What is Dory */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is Dory?</h3>
                  <p className="text-sm text-muted-foreground">
                    Dory is your co-worker that lives in your computer. You type what you need, and Dory does it — 
                    whether that's writing code, searching the internet, reading your files, or running commands. 
                    Think of it like texting a really smart colleague who can actually touch your computer.
                  </p>
                </div>

                {/* How does it work */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">How does it work?</h3>
                  <p className="text-sm text-muted-foreground">
                    When you send a message, it goes to NVIDIA's servers where a powerful language model 
                    (think: a very sophisticated autocomplete that understands context) figures out what you need. 
                    Then Dory uses its tools — like reading files, running terminal commands, or searching Google — 
                    to actually do the work. It's not just giving you answers; it's taking action.
                  </p>
                </div>

                {/* What are Tools */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are "Tools"?</h3>
                  <p className="text-sm text-muted-foreground">
                    Tools are Dory's hands. Without tools, Dory could only talk. With tools, Dory can actually 
                    do things on your computer: create files, run programs, search the web, remember things you told it, 
                    and more. Each tool listed above is a specific capability — like giving someone access to your 
                    keyboard, your browser, or your file system.
                  </p>
                </div>

                {/* What is a Token */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are "Tokens"?</h3>
                  <p className="text-sm text-muted-foreground">
                    Tokens are how the system measures text. Roughly, 1 token ≈ 4 characters or about ¾ of a word. 
                    When you see "238 tokens", that's roughly 180 words. The model can handle about 128,000 tokens 
                    at once — that's roughly a 200-page book. The "context" percentage shows how much of that 
                    capacity you've used in the current conversation.
                  </p>
                </div>

                {/* What is RAG */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is "RAG"?</h3>
                  <p className="text-sm text-muted-foreground">
                    RAG stands for "Retrieval-Augmented Generation" — but forget the jargon. It just means Dory 
                    can search through your own documents before answering. Instead of only knowing what it was 
                    trained on, Dory can look up information in files you've added. It's like giving Dory a 
                    filing cabinet of your stuff to reference.
                  </p>
                </div>

                {/* What is the Context Window */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is "Context"?</h3>
                  <p className="text-sm text-muted-foreground">
                    Context is Dory's short-term memory for the current conversation. Everything you've said, 
                    everything Dory has replied, and all the tool results — it all stays in context so Dory 
                    remembers what you're working on. When context fills up (100%), older messages get forgotten. 
                    Starting a new chat clears the context.
                  </p>
                </div>

                {/* What is Memory */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is "Memory"?</h3>
                  <p className="text-sm text-muted-foreground">
                    Memory is different from context. Memory persists across conversations — it's saved to a file 
                    on your computer. When you tell Dory to "remember" something, it stores it in memory. 
                    Next time you chat (even days later), Dory can recall it. Context is temporary; memory is permanent.
                  </p>
                </div>

                {/* Privacy */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">Is my data private?</h3>
                  <p className="text-sm text-muted-foreground">
                    Your conversations are sent to NVIDIA's servers for processing — that's how the language model works. 
                    However, your files, memory, and conversation history are stored locally on your computer, 
                    not uploaded anywhere. The tools run on your machine. NVIDIA processes the text but doesn't 
                    store your conversations permanently.
                  </p>
                </div>

                {/* Modes */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are the modes?</h3>
                  <p className="text-sm text-muted-foreground">
                    <strong>Dory</strong> — Full access to everything. Dory decides which tools to use based on what you ask. 
                    This is the default and handles 99% of tasks.<br/><br/>
                    <strong>Dory (Supervised)</strong> — For complex research. Uses multiple specialist "sub-workers" that 
                    check each other's work. Takes longer but produces more thorough, reviewed results.
                  </p>
                </div>
              </div>
            </section>

          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
