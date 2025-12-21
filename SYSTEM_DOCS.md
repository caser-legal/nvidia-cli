# NVIDIA CLI (Dory) - Complete System Documentation

## Overview

**nvidia-cli** (codename: **dory**) is a personal AI development assistant for building iOS apps and enterprise applications. It's a self-contained system - no MCP needed because all tools are built directly into the agent.

**Owner:** Single user (personal dev tool, not for end users)
**Purpose:** Help build iOS apps, write code, research, file operations

---

## Architecture Diagram

```
YOU  →  Web UI (localhost:3000)  →  Agent (TypeScript)  →  NVIDIA NIM API
                                          │
                                          ├──→ bash (child_process)
                                          ├──→ file_read (fs)
                                          ├──→ file_write (fs)
                                          ├──→ google_search (googleapis.com)
                                          ├──→ tavily_search (tavily.com)
                                          ├──→ memory (JSON file)
                                          ├──→ think (reasoning)
                                          ├──→ mermaid_generator
                                          ├──→ github_analyzer (git clone)
                                          ├──→ code_documentation
                                          ├──→ specialist_agents (8 sub-agents)
                                          ├──→ reflection
                                          ├──→ parallel_search
                                          ├──→ local_docs_search
                                          ├──→ report_planner
                                          └──→ rag_tools
                                          │
                                          ▼
                                    Response to you
```

---

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NVIDIA CLI (DORY) WORKFLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER INPUT                                                              │
│     └── Web UI at localhost:3000                                            │
│         └── POST /api/agent-chat                                            │
│                                                                             │
│  2. SECURITY LAYER                                                          │
│     ├── PII Guard: Redacts emails, phones, API keys, IPs                    │
│     └── Tool Guard: Permission checks for sensitive tools                   │
│                                                                             │
│  3. INTELLIGENCE LAYER                                                      │
│     ├── Retrieval Router: Decides RAG vs Web vs Memory                      │
│     └── Tool Orchestrator: Picks which tools to use                         │
│                                                                             │
│  4. UNIFIED CONTEXT LAYER                                                   │
│     ├── RAG Pipeline (NVIDIA embeddings + reranker)                         │
│     ├── Short-term Memory (session)                                         │
│     ├── Long-term Memory (~/.nvidia-cli/memory.json)                        │
│     ├── Entity Memory (people, projects, companies)                         │
│     └── Flywheel History (past interactions)                                │
│                                                                             │
│  5. LLM CALL                                                                │
│     └── NVIDIA NIM API (integrate.api.nvidia.com)                           │
│         └── Model: nvidia/nemotron-3-nano-30b-a3b (default)                 │
│         └── Returns: Text + Tool calls                                      │
│                                                                             │
│  6. TOOL EXECUTION (Direct API/System calls - NO MCP)                       │
│     ├── bash: subprocess.exec()                                             │
│     ├── file_read/write: fs module                                          │
│     ├── google_search: googleapis.com/customsearch                          │
│     ├── tavily_search: api.tavily.com                                       │
│     ├── memory: JSON file read/write                                        │
│     ├── github_analyzer: git clone + analysis                               │
│     └── ... (16 tools total)                                                │
│                                                                             │
│  7. LOOP: Tool results → Back to LLM → More tools or final response         │
│                                                                             │
│  8. LEARNING LAYER                                                          │
│     ├── Flywheel Logger: Logs all interactions                              │
│     ├── Feedback Optimizer: Analyzes failures                               │
│     └── Auto RAG Updater: Good answers → RAG knowledge                      │
│                                                                             │
│  9. RESPONSE: Streamed back to Web UI                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/agents/agent.ts` | Core agent loop, tool execution |
| `lib/agents/unified-context.ts` | Combines RAG + Memory + Flywheel |
| `lib/agents/retrieval-router.ts` | Decides where to get context |
| `lib/agents/tool-orchestrator.ts` | Picks tools dynamically |
| `lib/agents/tools/*.ts` | 16 tool implementations |
| `lib/agents/rag/pipeline.ts` | RAG with NVIDIA embeddings |
| `lib/agents/flywheel/logger.ts` | Interaction logging |
| `lib/nvidia.ts` | NVIDIA NIM API client |
| `lib/security/pii-guard.ts` | PII redaction |
| `lib/security/tool-guard.ts` | Tool permissions |
| `app/api/agent-chat/route.ts` | API endpoint |
| `components/agents/agent-chat.tsx` | Chat UI component |

---

## Tools (16 Total)

| Tool | File | What It Does |
|------|------|--------------|
| `bash` | bash.ts | Execute shell commands |
| `file_read` | file-read.ts | Read file contents |
| `file_write` | file-write.ts | Write/modify files |
| `think` | think.ts | Extended reasoning |
| `memory` | memory.ts | Store/retrieve from long-term memory |
| `google_search` | google-search.ts | Google Custom Search API |
| `tavily_search` | tavily-search.ts | Tavily web search |
| `github_analyzer` | github-analyzer.ts | Clone and analyze repos |
| `mermaid_generator` | mermaid-generator.ts | Create diagrams |
| `code_documentation` | code-documentation.ts | Generate docs |
| `specialist_agents` | specialist-agents.ts | 8 sub-agents for research |
| `reflection` | reflection.ts | Self-critique loops |
| `parallel_search` | parallel-search.ts | Multi-source search |
| `local_docs_search` | local-docs-search.ts | Search local docs |
| `report_planner` | report-planner.ts | Plan research reports |
| `rag_tools` | rag-tools.ts | RAG operations |

---

## Agent Modes

| Mode | Description |
|------|-------------|
| **Auto** (default) | Intelligently picks tools for any task |
| **Chat** | General conversation with memory |
| **Coder** | Autonomous coding with GitHub analyzer |
| **Docs** | Documentation generation |
| **Controller** | Computer automation (bash, files) |
| **Browser** | Web search focused |
| **Research** | Deep research with parallel search |
| **Coordinator** | Multi-agent research |

---

## Models

| Model | Context | Use |
|-------|---------|-----|
| `nvidia/nemotron-3-nano-30b-a3b` | 1M tokens | Default agent |
| `nvidia/llama-3.1-nemotron-70b-instruct` | 128K | RAG pipeline |
| `qwen/qwen3-coder-480b-a35b-instruct` | 128K | Code generation |

---

## External Services

| Service | URL | Purpose |
|---------|-----|---------|
| NVIDIA NIM | integrate.api.nvidia.com | LLM inference |
| Google Search | googleapis.com/customsearch | Web search |
| Tavily | api.tavily.com | Web search |
| GitHub | github.com | Repo cloning |

---

## Local Storage

| Path | Purpose |
|------|---------|
| `~/.nvidia-cli/memory.json` | Long-term memory |
| `prisma/dev.db` | Conversations, sessions |
| `.env.local` | API keys |

---

## Environment Variables

```
NVIDIA_API_KEY=nvapi-xxx        # Required
TAVILY_API_KEY=tvly-xxx         # Optional
GOOGLE_API_KEY=xxx              # Optional
GOOGLE_CSE_ID=xxx               # Optional
```

---

## Running

```bash
npm run dev          # Start Next.js on localhost:3000
./bin/dory "query"   # CLI mode
```

---

## NOT Using

- **MCP**: Tools are built-in, not exposed via protocol
- **NeMo Agent Toolkit**: Custom TS agent is sufficient for personal use
- **Claude Desktop/Cursor**: This IS the UI replacement

---

## Testing Checklist

When testing the agent, verify:

1. **bash** - Can it run `ls`, `pwd`, `mkdir`?
2. **file_read** - Can it read package.json?
3. **file_write** - Can it create a test file?
4. **memory** - Can it store and recall information?
5. **google_search** - Does web search work?
6. **think** - Does it reason through complex problems?
7. **Mode switching** - Does Auto mode pick the right tools?

---

## Known Issues to Watch

1. Tool calls may not execute if agent doesn't format them correctly
2. Streaming may break on long responses
3. Memory search is basic (string matching, not semantic)
4. RAG vector store is in-memory (resets on restart)
