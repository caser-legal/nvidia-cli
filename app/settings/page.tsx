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
  ArrowLeft, RotateCcw, Cloud, Server, Cpu, RefreshCw, Lightbulb, Check
} from "lucide-react";
import { LiveLogs } from "@/components/live-logs";

// Tool definitions with full documentation - All 36 tools
const TOOLS = [
  // ============ PROJECT (2) ============
  {
    name: "set_project",
    path: "lib/agents/tools/project.ts",
    category: "Project",
    description: "Sets the current working directory for all file and bash operations.",
    howItWorks: "Updates a global variable that file_read, file_write, and bash tools use as their base path. Validates the directory exists before setting. All relative paths in other tools will be relative to this directory.",
    example: 'set_project({ path: "/Users/home/Documents/MyApp" })',
  },
  {
    name: "get_project", 
    path: "lib/agents/tools/project.ts",
    category: "Project",
    description: "Returns the current working directory path.",
    howItWorks: "Simply returns the global project directory variable. Useful for confirming which project you're working in before making changes.",
    example: "get_project()",
  },
  // ============ FILE SYSTEM (2) ============
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
    description: "Creates or overwrites files with complete content.",
    howItWorks: "Uses Node.js fs module. Always use 'write' operation with complete file content. Creates parent directories if they don't exist.",
    example: 'file_write({ operation: "write", path: "hello.txt", content: "Hello World" })',
  },
  // ============ SYSTEM (1) ============
  {
    name: "bash",
    path: "lib/agents/tools/bash.ts",
    category: "System",
    description: "Executes shell commands on your system.",
    howItWorks: "Uses Node.js child_process.exec() to run commands. Executes in the current project directory. Returns stdout/stderr output. Has a timeout to prevent hanging commands.",
    example: 'bash({ command: "ls -la" })',
  },
  // ============ REASONING (1) ============
  {
    name: "think",
    path: "lib/agents/tools/think.ts",
    category: "Reasoning",
    description: "Internal reasoning tool for complex problem solving.",
    howItWorks: "Allows the agent to 'think out loud' and break down complex problems into steps before taking action. The thought is logged but doesn't produce output to you - it helps the agent organize its approach.",
    example: 'think({ thought: "I need to first check if the file exists, then read it, then modify line 42..." })',
  },
  // ============ MEMORY (2) ============
  {
    name: "memory",
    path: "lib/agents/tools/memory.ts",
    category: "Memory",
    description: "Stores and retrieves information across conversations.",
    howItWorks: "Short-term memory is session-based (RAM) - gone when you close the browser. Long-term memory persists to ~/.nvidia-cli/memory.json file - survives restarts. Use 'store' to save, 'retrieve' to get, 'search' to find.",
    example: 'memory({ operation: "store", key: "user_preference", value: "dark mode", type: "long" })',
  },
  {
    name: "entity_memory",
    path: "lib/agents/tools/memory.ts",
    category: "Memory",
    description: "Tracks entities like people, projects, companies, and technologies.",
    howItWorks: "Specialized memory that categorizes and links related entities. Helps maintain context about things you frequently discuss. Entities have types (person, project, company, tech) and can have relationships.",
    example: 'entity_memory({ operation: "add", type: "project", name: "MyApp", details: "iOS SwiftUI app for task management" })',
  },
  // ============ SEARCH (3) ============
  {
    name: "google_search",
    path: "lib/agents/tools/google-search.ts",
    category: "Search",
    description: "Searches Google for information.",
    howItWorks: "Uses Google Custom Search API. Requires GOOGLE_API_KEY and GOOGLE_CSE_ID in environment. Returns top 10 search results with titles, snippets, and URLs. Good for quick lookups.",
    example: 'google_search({ query: "Swift async await tutorial" })',
  },
  {
    name: "parallel_search",
    path: "lib/agents/tools/parallel-search.ts",
    category: "Search",
    description: "Runs multiple Google searches simultaneously.",
    howItWorks: "Takes an array of queries and executes them in parallel using Promise.all(). Much faster than sequential searches for multi-topic research. Deduplicates results automatically.",
    example: 'parallel_search({ queries: ["SwiftUI navigation", "UIKit navigation", "Combine framework"] })',
  },
  {
    name: "local_docs_search",
    path: "lib/agents/tools/local-docs-search.ts",
    category: "Search",
    description: "Searches local documentation files in your project.",
    howItWorks: "Scans markdown (.md) and text (.txt) files in your project for keyword matches. Useful for finding information in your own docs without web search. Searches file contents, not just names.",
    example: 'local_docs_search({ query: "authentication flow" })',
  },
  // ============ VISION (3) ============
  {
    name: "vision_analyze",
    path: "lib/agents/tools/vision-analysis.ts",
    category: "Vision",
    description: "Analyzes images or video using NVIDIA's vision model.",
    howItWorks: "Uses Nemotron Nano VL 12B v2 - a vision-language model that can 'see' images. Send it screenshots, photos, diagrams, or video frames and ask questions about what's in them. Supports up to 5 images or 1 video.",
    example: 'vision_analyze({ image_path: "./screenshot.png", question: "What UI elements are visible?" })',
  },
  {
    name: "ios_ui_review",
    path: "lib/agents/tools/vision-analysis.ts",
    category: "Vision",
    description: "Reviews iOS screenshots for UI/UX issues.",
    howItWorks: "Specialized vision analysis for iOS development. Checks for alignment issues, spacing problems, accessibility concerns (touch targets, contrast), and SwiftUI best practices. Returns actionable feedback.",
    example: 'ios_ui_review({ screenshot: "./HomeScreen.png" })',
  },
  {
    name: "compare_mockup",
    path: "lib/agents/tools/vision-analysis.ts",
    category: "Vision",
    description: "Compares a design mockup to the actual implementation.",
    howItWorks: "Takes two images - your Figma/Sketch mockup and a screenshot of your implementation - and identifies differences. Helps catch visual regressions and ensure pixel-perfect implementation.",
    example: 'compare_mockup({ mockup: "./design.png", implementation: "./screenshot.png" })',
  },
  // ============ RAG (8) ============
  {
    name: "rag_ingest",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Adds documents to the knowledge base for later searching.",
    howItWorks: "RAG (Retrieval-Augmented Generation) lets Dory search your documents. This tool: 1) Splits documents into chunks, 2) Converts chunks to embeddings (numerical vectors), 3) Stores in vector database. Now rag_search can find them.",
    example: 'rag_ingest({ path: "./docs" })',
  },
  {
    name: "rag_search",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Searches your documents using hybrid BM25 + semantic search.",
    howItWorks: "Uses two search methods combined: BM25 (exact keyword matching - good for function names) + Vector search (semantic similarity - good for concepts). Results are reranked by NVIDIA's reranker model for best relevance.",
    example: 'rag_search({ query: "how to authenticate users" })',
  },
  {
    name: "rag_query",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Asks questions and gets answers based on your documents.",
    howItWorks: "Combines rag_search with the LLM: 1) Searches for relevant document chunks, 2) Sends those chunks + your question to the LLM, 3) LLM generates an answer citing the sources. Like having a research assistant.",
    example: 'rag_query({ question: "What authentication methods does our app support?" })',
  },
  {
    name: "rag_research",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Deep research with automatic query decomposition.",
    howItWorks: "For complex questions: 1) Breaks your question into sub-questions, 2) Searches for each sub-question, 3) Synthesizes all findings into a comprehensive answer. Based on NVIDIA's research agent pattern.",
    example: 'rag_research({ topic: "Compare our REST API vs GraphQL implementation" })',
  },
  {
    name: "rag_stats",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Shows statistics about the RAG knowledge base.",
    howItWorks: "Returns: number of documents ingested, total chunks created, which files are indexed, and storage size. Useful for understanding what Dory 'knows' about your project.",
    example: "rag_stats()",
  },
  {
    name: "rag_clear",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Clears all documents from the RAG knowledge base.",
    howItWorks: "Removes all embeddings and document chunks from the vector store. Use when you want to start fresh or re-ingest with different settings. Cannot be undone.",
    example: "rag_clear()",
  },
  {
    name: "rag_validate",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Validates RAG documents and removes stale entries.",
    howItWorks: "Checks if source files still exist on disk. If a file was deleted but its chunks are still in RAG, this removes them. Keeps your knowledge base in sync with your actual files.",
    example: "rag_validate()",
  },
  {
    name: "rag_update",
    path: "lib/agents/tools/rag-tools.ts",
    category: "RAG",
    description: "Updates RAG documents from a source path.",
    howItWorks: "Re-ingests documents from a path. Removes old chunks from that path first, then re-processes. Use after you've edited files and want RAG to reflect the changes.",
    example: 'rag_update({ path: "./src" })',
  },
  // ============ CODE (4) ============
  {
    name: "github_analyzer",
    path: "lib/agents/tools/github-analyzer.ts",
    category: "Code",
    description: "Clones and analyzes GitHub repositories.",
    howItWorks: "Clones repo to a temp directory, then analyzes: file structure, languages used, lines of code, dependencies, README content. Great for understanding unfamiliar codebases quickly.",
    example: 'github_analyzer({ repo_url: "https://github.com/apple/swift" })',
  },
  {
    name: "github_file_reader",
    path: "lib/agents/tools/github-analyzer.ts",
    category: "Code",
    description: "Reads specific files from cloned GitHub repos.",
    howItWorks: "After github_analyzer clones a repo, this tool reads individual files from the cloned copy. Useful for diving into specific files after getting the overview.",
    example: 'github_file_reader({ repo: "apple/swift", path: "README.md" })',
  },
  {
    name: "code_documentation",
    path: "lib/agents/tools/code-documentation.ts",
    category: "Code",
    description: "Generates documentation for codebases.",
    howItWorks: "Analyzes code structure and generates documentation using the LLM. Can create: README files, API documentation, architecture overviews, or inline code comments.",
    example: 'code_documentation({ type: "readme", path: "." })',
  },
  {
    name: "documentation_specialist",
    path: "lib/agents/tools/code-documentation.ts",
    category: "Code",
    description: "Advanced documentation generation with multiple passes.",
    howItWorks: "More thorough than code_documentation. Does multiple analysis passes, generates diagrams, creates cross-references, and produces comprehensive documentation packages.",
    example: 'documentation_specialist({ path: "./src", output: "./docs" })',
  },
  // ============ DIAGRAMS (2) ============
  {
    name: "mermaid_generator",
    path: "lib/agents/tools/mermaid-generator.ts",
    category: "Diagrams",
    description: "Creates Mermaid diagrams for architecture visualization.",
    howItWorks: "Mermaid is a text-based diagramming language that renders as images. This tool generates: flowcharts, sequence diagrams, class diagrams, ER diagrams, and architecture diagrams from natural language descriptions.",
    example: 'mermaid_generator({ type: "flowchart", description: "User login flow with OAuth" })',
  },
  {
    name: "quick_diagram",
    path: "lib/agents/tools/mermaid-generator.ts",
    category: "Diagrams",
    description: "Fast diagram generation using pre-built templates.",
    howItWorks: "Pre-built templates for common diagram types: API flows, database schemas, component hierarchies, state machines. Faster than mermaid_generator for standard patterns.",
    example: 'quick_diagram({ template: "api_flow", title: "User Authentication" })',
  },
  // ============ SPECIALIST AGENTS (8) ============
  {
    name: "search_specialist",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Deep multi-source research agent.",
    howItWorks: "A sub-agent specialized in research. Uses parallel searches across multiple sources (Google, local docs), deduplicates findings, and synthesizes comprehensive research summaries with citations.",
    example: 'search_specialist({ topic: "iOS 18 SwiftUI changes", depth: "deep" })',
  },
  {
    name: "report_planner",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Creates structured outlines for reports and documents.",
    howItWorks: "Before writing a long document, this agent creates a structured outline: sections, subsections, key points for each. Identifies which sections need more research. Ensures logical flow.",
    example: 'report_planner({ topic: "Migration guide from UIKit to SwiftUI", style: "comprehensive" })',
  },
  {
    name: "section_author",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Writes individual sections of a document.",
    howItWorks: "Given an outline section, writes that section with proper citations, code examples, and formatting. Works with report_planner output. Maintains consistent style across sections.",
    example: 'section_author({ section: "Authentication Implementation", outline: "..." })',
  },
  {
    name: "report_writer",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Fast full draft generation for reports.",
    howItWorks: "Writes a complete first draft quickly. Less thorough than section_author but faster. Good for getting ideas down, then refining with other tools.",
    example: 'report_writer({ topic: "Weekly progress update", length: "medium" })',
  },
  {
    name: "quality_reviewer",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Evaluates output quality with scores and feedback.",
    howItWorks: "Reviews any output and scores it 0-10 on: accuracy, completeness, clarity, usefulness. Identifies gaps, errors, and areas for improvement. Used in quality loops.",
    example: 'quality_reviewer({ content: "...", criteria: ["accuracy", "completeness"] })',
  },
  {
    name: "report_extender",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Merges new findings into existing reports.",
    howItWorks: "When you have new information to add to an existing document, this agent integrates it smoothly: finds the right location, maintains style consistency, updates cross-references.",
    example: 'report_extender({ existing: "...", new_findings: "..." })',
  },
  {
    name: "report_compiler",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Final assembly and formatting of reports.",
    howItWorks: "Takes all sections and compiles into final document: adds table of contents, ensures consistent formatting, adds headers/footers, generates bibliography from citations.",
    example: 'report_compiler({ sections: [...], format: "markdown" })',
  },
  {
    name: "deduplicate_sources",
    path: "lib/agents/tools/specialist-agents.ts",
    category: "Specialists",
    description: "Cleans and deduplicates citation lists.",
    howItWorks: "When research pulls from many sources, citations can get messy. This tool: removes duplicates, standardizes formats, merges similar sources, and creates clean bibliography.",
    example: 'deduplicate_sources({ citations: [...] })',
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
  const [useLocalLLM, setUseLocalLLM] = React.useState(false);
  const [ollamaUrl, setOllamaUrl] = React.useState("http://192.168.50.50:11434/v1");
  const [embedUrl, setEmbedUrl] = React.useState("http://192.168.50.50:8000");
  const [googleKey, setGoogleKey] = React.useState("");
  const [googleCseId, setGoogleCseId] = React.useState("");

  // Hydration fix
  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("statsResetDate");
    if (saved) setStatsResetDate(saved);
    // Load LLM backend settings
    fetch("/api/settings/api-key")
      .then(res => res.json())
      .then(data => {
        if (data.useLocalLLM !== undefined) setUseLocalLLM(data.useLocalLLM);
        if (data.ollamaUrl) setOllamaUrl(data.ollamaUrl);
        if (data.embedUrl) setEmbedUrl(data.embedUrl);
      })
      .catch(() => {});
  }, []);

  // Load current API key on mount
  React.useEffect(() => {
    fetch("/api/settings/api-key")
      .then(res => res.json())
      .then(data => {
        if (data.apiKey) setLocalApiKey(data.apiKey);
        if (data.googleKey) setGoogleKey(data.googleKey);
        if (data.googleCseId) setGoogleCseId(data.googleCseId);
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

  const handleBackendChange = async (local: boolean) => {
    setUseLocalLLM(local);
    await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useLocalLLM: local, ollamaUrl, embedUrl }),
    });
  };

  const handleSaveOllamaUrl = async () => {
    await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useLocalLLM, ollamaUrl, embedUrl }),
    });
  };

  const handleSaveEmbedUrl = async () => {
    await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useLocalLLM, ollamaUrl, embedUrl }),
    });
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

              {/* LLM Backend Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium">LLM Backend</label>
                <div className="flex gap-2">
                  <Button
                    variant={!useLocalLLM ? "default" : "outline"}
                    className="flex-1 gap-2"
                    onClick={() => handleBackendChange(false)}
                  >
                    <Cloud className="h-4 w-4" /> NVIDIA NIM API
                  </Button>
                  <Button
                    variant={useLocalLLM ? "default" : "outline"}
                    className="flex-1 gap-2"
                    onClick={() => handleBackendChange(true)}
                  >
                    <Server className="h-4 w-4" /> Local Ollama
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {useLocalLLM 
                    ? `Using local Ollama at ${ollamaUrl}. Requires Ollama running with nemotron-3-nano.`
                    : "Using NVIDIA cloud API. Requires API key above."}
                </p>
              </div>

              {/* Ollama URL (only show when local) */}
              {useLocalLLM && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ollama URL (Main LLM - Port 11434)</label>
                    <div className="flex gap-2">
                      <Input
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://192.168.50.50:11434/v1"
                      />
                      <Button onClick={handleSaveOllamaUrl}>Save</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ollama serves the main chat model (Nemotron 3 Nano). This handles all conversations and reasoning.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Embedding Server URL (Port 8000)</label>
                    <div className="flex gap-2">
                      <Input
                        value={embedUrl}
                        onChange={(e) => setEmbedUrl(e.target.value)}
                        placeholder="http://192.168.50.50:8000"
                      />
                      <Button onClick={handleSaveEmbedUrl}>Save</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Python server for embeddings &amp; reranking. Used by RAG (document search) features.
                    </p>
                  </div>
                </>
              )}

              {/* Model Info */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-4">
                <div className="font-medium text-lg flex items-center gap-2">
                  <Cpu className="h-5 w-5" /> Your AI Model Stack
                </div>
                
                {/* Main LLM */}
                <div className="border-l-2 border-green-500 pl-3 space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    Main LLM: Nemotron 3 Nano
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                      {useLocalLLM ? "Local" : "Cloud"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This is the &quot;brain&quot; - handles all your conversations, code generation, and reasoning.
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1 mt-2">
                    <p>• <strong>30B MoE</strong> - Only ~3.5B parameters activate per request = faster + cheaper</p>
                    <p>• <strong>{useLocalLLM ? "1M" : "262K"} token context</strong> - {useLocalLLM ? "Full 1M native limit" : "Free tier limit (1M native)"}</p>
                    <p>• <strong>Reasoning ON/OFF</strong> - Can toggle deep thinking mode</p>
                  </div>
                </div>

                {/* Embeddings */}
                <div className="border-l-2 border-blue-500 pl-3 space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    Embeddings: NV EmbedQA 1B
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">RAG</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Converts your code/docs into vectors so the AI can search them semantically.
                  </p>
                  <div className="text-xs text-muted-foreground mt-2">
                    <p>• <code className="bg-muted px-1 rounded">rag_ingest</code> uses this to create searchable embeddings</p>
                    <p>• 2048-dimensional vectors, 8K token context per chunk</p>
                  </div>
                </div>

                {/* Reranker */}
                <div className="border-l-2 border-purple-500 pl-3 space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    Reranker: NV RerankQA 1B
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">RAG</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Re-scores search results to find the MOST relevant code snippets.
                  </p>
                  <div className="text-xs text-muted-foreground mt-2">
                    <p>• Embeddings find 100 candidates → Reranker picks the best 10</p>
                    <p>• Rate limited to 1 req/sec to avoid 429 errors</p>
                  </div>
                </div>

                {/* Vision */}
                <div className="border-l-2 border-orange-500 pl-3 space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    Vision: Nemotron Nano VL 12B
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">UI Analysis</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Analyzes screenshots and images - finds UI bugs, compares mockups to implementations.
                  </p>
                  <div className="text-xs text-muted-foreground mt-2">
                    <p>• <code className="bg-muted px-1 rounded">ios_ui_review</code> - check alignment, spacing issues</p>
                    <p>• <code className="bg-muted px-1 rounded">compare_mockup</code> - compare designs to your app</p>
                    <p>• 128K context, multi-image reasoning</p>
                  </div>
                </div>

                {/* How it all works together */}
                <div className="mt-4 p-3 rounded bg-muted/30 text-sm">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> How They Work Together
                  </div>
                  <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>You ask a question about your code</li>
                    <li><strong>Embeddings</strong> search your indexed codebase for relevant files</li>
                    <li><strong>Reranker</strong> picks the most relevant snippets</li>
                    <li><strong>Main LLM</strong> reads those snippets + your question and generates an answer</li>
                    <li>If you share a screenshot, <strong>Vision</strong> analyzes it first</li>
                  </ol>
                </div>

                {/* Single API Key note */}
                <div className="text-xs text-muted-foreground border-t pt-3 mt-3 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> <strong>One API Key:</strong> Your NVIDIA_API_KEY powers ALL of these models. No separate keys needed.
                </div>
              </div>

              {/* All API Keys Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="text-sm font-medium">API Keys</div>
                
                {/* NVIDIA Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    NVIDIA API Key
                    <span className="text-xs text-green-500">(Required)</span>
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
                      {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Powers all NVIDIA models (LLM, Embeddings, Reranker, Vision). Get from{" "}
                    <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-primary underline">build.nvidia.com</a>
                  </p>
                </div>

                {/* Google Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Google API Key
                    <span className="text-xs text-muted-foreground">(Web Search)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={googleKey}
                        onChange={(e) => setGoogleKey(e.target.value)}
                        placeholder="AIzaSy..."
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
                    <Button onClick={async () => {
                      await fetch("/api/settings/api-key", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ googleKey }),
                      });
                    }}>Save</Button>
                  </div>
                </div>

                {/* Google CSE ID */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Google Search Engine ID
                    <span className="text-xs text-muted-foreground">(Web Search)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={googleCseId}
                        onChange={(e) => setGoogleCseId(e.target.value)}
                        placeholder="abc123..."
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
                    <Button onClick={async () => {
                      await fetch("/api/settings/api-key", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ googleCseId }),
                      });
                    }}>Save</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Google Custom Search. Get from <a href="https://programmablesearchengine.google.com" target="_blank" rel="noopener" className="text-primary underline">programmablesearchengine.google.com</a>
                  </p>
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

              {/* Live Dev Server Logs */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Live Server Output
                </label>
                <LiveLogs className="h-[400px] rounded-lg border" />
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
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">Cmd + ,</kbd>
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
                  <span>New Line in Input</span>
                  <kbd className="bg-background px-2 py-0.5 rounded text-xs">Ctrl + J</kbd>
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
                    Dory is your AI co-worker that lives in your computer. You type what you need, and Dory does it — 
                    whether that&apos;s writing code, searching the internet, reading your files, or running commands. 
                    Think of it like texting a really smart colleague who can actually touch your computer.
                  </p>
                </div>

                {/* How does it work */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">How does it work?</h3>
                  <p className="text-sm text-muted-foreground">
                    When you send a message, it goes to NVIDIA&apos;s servers where a powerful language model 
                    (Nemotron 3 Nano - a 30B MoE model with ~3.5B active parameters) 
                    figures out what you need. Then Dory uses its 36 tools — like reading files, running terminal 
                    commands, or searching Google — to actually do the work. It&apos;s not just giving you answers; 
                    it&apos;s taking action.
                  </p>
                </div>

                {/* What are Tools */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are &quot;Tools&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Tools are Dory&apos;s hands. Without tools, Dory could only talk. With tools, Dory can actually 
                    do things on your computer: create files, run programs, search the web, remember things you told it, 
                    analyze images, and more. Each of the 36 tools listed above is a specific capability — like giving 
                    someone access to your keyboard, your browser, or your file system.
                  </p>
                </div>

                {/* What is a Token */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are &quot;Tokens&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Tokens are how the system measures text. Roughly, 1 token ≈ 4 characters or about ¾ of a word. 
                    When you see &quot;238 tokens&quot;, that&apos;s roughly 180 words. On the free cloud tier, context is limited to 
                    262K tokens (~200K words). Self-hosted can use the full 1M token native limit.
                  </p>
                </div>

                {/* What is RAG */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is &quot;RAG&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    RAG stands for &quot;Retrieval-Augmented Generation&quot; — but forget the jargon. It just means Dory 
                    can search through your own documents before answering. Instead of only knowing what it was 
                    trained on, Dory can look up information in files you&apos;ve added. It uses &quot;hybrid search&quot; — 
                    combining exact keyword matching (BM25) with semantic understanding (vector search) — so it 
                    finds both exact function names AND conceptually related code.
                  </p>
                </div>

                {/* What is Hybrid Search */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is &quot;Hybrid Search&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Dory uses two search methods combined: <strong>BM25</strong> finds exact matches (great for 
                    searching &quot;viewDidLoad&quot; or &quot;@Observable&quot;), while <strong>Vector search</strong> finds 
                    semantically similar content (great for &quot;how do I handle state&quot;). Results from both are 
                    merged using &quot;Reciprocal Rank Fusion&quot; and then re-ranked by NVIDIA&apos;s reranker model. 
                    This gives you the best of both worlds.
                  </p>
                </div>

                {/* What is the Context Window */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is &quot;Context&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Context is Dory&apos;s short-term memory for the current conversation. Everything you&apos;ve said, 
                    everything Dory has replied, and all the tool results — it all stays in context so Dory 
                    remembers what you&apos;re working on. When context fills up (100%), older messages get forgotten. 
                    Starting a new chat clears the context.
                  </p>
                </div>

                {/* What is Memory */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is &quot;Memory&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Memory is different from context. Memory persists across conversations — it&apos;s saved to a file 
                    on your computer (~/.nvidia-cli/memory/). When you tell Dory to &quot;remember&quot; something, it 
                    stores it in memory with semantic embeddings. Next time you chat (even days later), Dory can recall it 
                    via semantic search. Context is temporary; memory is permanent.
                  </p>
                </div>

                {/* What are Specialist Agents */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What are &quot;Specialist Agents&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    For complex tasks, Dory can delegate to specialized sub-agents. Think of them as expert 
                    colleagues: search_specialist does deep research, report_planner creates outlines, 
                    quality_reviewer checks work, etc. When you ask for something complex like &quot;write a 
                    comprehensive guide&quot;, Dory automatically coordinates these specialists to produce 
                    higher-quality output than a single pass would.
                  </p>
                </div>

                {/* Vision */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is &quot;Vision Analysis&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Dory can &quot;see&quot; images using NVIDIA&apos;s Nemotron Nano VL 12B vision model (128K context, multi-image). 
                    Send screenshots of your iOS app and Dory can identify UI issues, check alignment, compare to mockups, 
                    and suggest improvements. It&apos;s like having a design reviewer who can actually look at 
                    your screens.
                  </p>
                </div>

                {/* Privacy */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">Is my data private?</h3>
                  <p className="text-sm text-muted-foreground">
                    Your conversations are sent to NVIDIA&apos;s servers for processing — that&apos;s how the language model works. 
                    However, your files, memory, RAG database, and conversation history are stored locally on your 
                    computer, not uploaded anywhere. The tools run on your machine. NVIDIA processes the text but 
                    doesn&apos;t store your conversations permanently. PII (emails, phone numbers, API keys) is 
                    automatically redacted before sending.
                  </p>
                </div>

                {/* What is the Data Flywheel */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What is the &quot;Data Flywheel&quot;?</h3>
                  <p className="text-sm text-muted-foreground">
                    Dory logs all interactions locally (not uploaded). This data could be used to: fine-tune 
                    smaller models for faster/cheaper inference, identify common failure patterns, or measure 
                    quality over time. It&apos;s based on NVIDIA&apos;s Data Flywheel Blueprint — the idea that production 
                    data can continuously improve AI systems.
                  </p>
                </div>

                {/* Capabilities */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <h3 className="font-medium">What can Dory do?</h3>
                  <p className="text-sm text-muted-foreground">
                    <strong>Everything is always enabled.</strong> Dory has full access to: file operations (read/write), 
                    shell commands (bash), web search (Google), RAG (document search with hybrid BM25+vector), 
                    memory (short-term and long-term), vision analysis (screenshots/mockups), GitHub analysis, 
                    diagram generation, and 8 specialist agents for complex research and documentation tasks.
                  </p>
                </div>
              </div>
            </section>

            {/* Shutdown */}
            <section className="space-y-4 pb-8">
              <h2 className="text-lg font-semibold border-b pb-2">System</h2>
              <div className="p-4 rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Shutdown Dory</h3>
                    <p className="text-sm text-muted-foreground">
                      Stops all running processes including the server, terminal, and any active agents.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (confirm("This will shut down Dory and close the server. Continue?")) {
                        await fetch("/api/shutdown", { method: "POST" });
                        window.close();
                      }
                    }}
                  >
                    Shutdown
                  </Button>
                </div>
              </div>
            </section>

          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
