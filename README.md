<p align="center">
  <img src="public/nvidia-logo.webp" alt="Dory" width="120" />
</p>

<h1 align="center">Dory</h1>

<p align="center">
  <strong>Your NVIDIA Powered Co-Worker</strong><br/>
  <em>Powered by NVIDIA NIM • 35 Custom Tools • 1M Token Context • RAG + Memory</em>
</p>

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/caser-legal/nvidia-cli.git
cd nvidia-cli
npm install

# Run (API keys are hardcoded for private use)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Or use the shell alias:
```bash
nv      # Start everything (ES, MCP, Terminal, Next.js)
nvquit  # Stop everything
```

---

## What is Dory?

A complete AI-powered coding assistant built for iOS/SwiftUI development:

- **35 hand-built tools** for file operations, code search, web research, memory
- **RAG system** that indexes your entire Xcode project
- **Persistent vector memory** that remembers across sessions
- **MCP integration** so tools work in Codex CLI and web app
- **Data flywheel** that logs interactions for model fine-tuning

All powered by **NVIDIA's Nemotron 3 Nano** with 1M token context.

---

## NVIDIA Model Stack

Single `NVIDIA_API_KEY` powers everything:

| Model | Purpose |
|-------|---------|
| **Nemotron 3 Nano 30B** | Main LLM (1M context, MoE) |
| **NV-EmbedQA 1B v2** | Embeddings (2048-dim) |
| **NV-RerankQA 1B v2** | Reranking search results |
| **Nemotron Nano VL 12B v2** | Vision/UI analysis |

---

## Tools (35)

### File & System
| Tool | Description |
|------|-------------|
| `set_project` | Set working directory |
| `get_project` | Get current directory |
| `file_read` | Read files/directories |
| `file_write` | Write complete files |
| `bash` | Execute shell commands |

### RAG (8)
| Tool | Description |
|------|-------------|
| `rag_ingest` | Index documents |
| `rag_search` | Hybrid BM25+Vector search |
| `rag_query` | Ask questions with context |
| `rag_research` | Deep research |
| `rag_stats` | Database statistics |
| `rag_clear` | Clear all documents |
| `rag_validate` | Validate documents |
| `rag_update` | Update from source |

### Search (3)
| Tool | Description |
|------|-------------|
| `google_search` | Web search |
| `parallel_search` | Multiple queries |
| `local_docs_search` | Local documentation |

### Memory (3)
| Tool | Description |
|------|-------------|
| `memory` | Semantic memory |
| `entity_memory` | Track entities |
| `unified_memory` | Combined memory |

### Vision (3)
| Tool | Description |
|------|-------------|
| `vision_analyze` | Analyze images |
| `ios_ui_review` | Check UI compliance |
| `compare_mockup` | Compare to mockups |

### Code & Docs (4)
| Tool | Description |
|------|-------------|
| `github_analyzer` | Analyze repos |
| `github_file_reader` | Read repo files |
| `code_documentation` | Generate docs |
| `documentation_specialist` | Advanced docs |

### Diagrams (2)
| Tool | Description |
|------|-------------|
| `mermaid_generator` | Create diagrams |
| `quick_diagram` | Fast templates |

### Reports (8)
| Tool | Description |
|------|-------------|
| `search_specialist` | Deep research |
| `report_planner` | Create outlines |
| `section_author` | Write sections |
| `report_writer` | Full drafts |
| `quality_reviewer` | Score output |
| `report_extender` | Add findings |
| `report_compiler` | Final assembly |
| `deduplicate_sources` | Clean citations |

### Flywheel (4)
| Tool | Description |
|------|-------------|
| `flywheel_log` | Log interactions |
| `flywheel_stats` | View metrics |
| `flywheel_export` | Export data |
| `flywheel_create_dataset` | Create training sets |

### Other (1)
| Tool | Description |
|------|-------------|
| `think` | Internal reasoning |

---

## File Operations

### file_write

Writes complete files. Always read first, modify, write entire content back.

```typescript
// Signature
file_write(path: string, content: string)

// Example
file_write("./MyView.swift", "import SwiftUI\n\nstruct MyView: View {\n    var body: some View {\n        Text(\"Hello\")\n    }\n}")
```

**Pattern:**
1. `file_read` the target file
2. `think` about changes needed
3. `file_write` with complete modified content
4. `file_read` to verify

### file_read

Reads files or lists directories.

```typescript
// Read file
file_read(operation: "read", path: "./MyView.swift")

// List directory
file_read(operation: "list", path: "./Sources/")
```

---

## RAG System

Based on NVIDIA RAG Blueprint:

1. **Ingestion** - Swift-aware chunking (800 chars, respects class/func boundaries)
2. **Hybrid Search** - BM25 (keywords) + Vector (semantic) with RRF fusion
3. **Reranking** - Top 100 → NV-RerankQA → Top 10
4. **Generation** - Answer with citations

### Usage

```bash
# In Dory chat:
"rag_ingest /Users/home/Documents/iOS/MyApp"
"rag_search how does the login flow work"
"rag_query what patterns does this codebase use"
```

---

## Memory System

Vector-based semantic memory:

- **Storage**: `~/.nvidia-cli/memory/vector-memory.json`
- **Retrieval**: Cosine similarity search
- **Embeddings**: NV-EmbedQA 1B v2 (2048-dim)

```bash
# Remember something
"memory remember that I prefer @Observable over ObservableObject"

# Recall later
"memory recall state management preferences"
```

---

## Data Flywheel

Logs every interaction for model improvement:

| Component | Purpose |
|-----------|---------|
| `FlywheelLogger` | Captures interactions |
| `FlywheelEvaluator` | LLM-as-Judge scoring |
| `DatasetCreator` | Train/eval/test splits |
| `QualityFilter` | Routes to sft_traces/ or dpo_traces/ |
| `ErrorMonitor` | Alerts on >5% error rate |

### Directories

| Directory | Purpose |
|-----------|---------|
| `sft_traces/` | High-quality (reward=1) |
| `dpo_traces/` | Low-quality (reward=0) |
| `dlq/` | Failed ES writes |

### Dashboard

```bash
open http://localhost:3000/dashboard
```

---

## MCP Integration

The MCP server (`mcp-server.ts`) exposes all 35 tools to any MCP-compatible client.

### Codex CLI Config

Add to `~/.codex/config.toml`:

```toml
model = "nvidia/nemotron-3-nano-30b-a3b"
model_provider = "nvidia-nim"

[model_providers.nvidia-nim]
name = "NVIDIA NIM"
base_url = "https://integrate.api.nvidia.com/v1"
env_key = "NGC_API_KEY"
wire_api = "chat"

[mcp_servers.nvidia-cli]
command = "npx"
args = ["tsx", "/Users/home/Documents/nvidia-cli/mcp-server.ts"]
cwd = "/Users/home/Documents/nvidia-cli"
startup_timeout_sec = 120
tool_timeout_sec = 120
```

---

## Shell Aliases

Add to `~/.zshrc`:

```bash
alias nv="/Users/home/Documents/nvidia-cli/start.sh"
alias nvquit="pkill -f 'next dev' ; pkill -f 'terminal-server' ; pkill -f 'mcp-server' ; pkill -f 'node.*nvidia-cli' ; kill \$(cat ~/Downloads/elasticsearch-8.11.0/es.pid 2>/dev/null) 2>/dev/null ; echo '✅ Dory + ES shutdown complete.'"
```

### What `nv` Starts

1. Elasticsearch (port 9200)
2. MCP Server
3. Terminal Server
4. Next.js (port 3000)
5. Opens browser

---

## Project Structure

```
nvidia-cli/
├── app/
│   ├── api/
│   │   ├── agent-chat/route.ts    # Main endpoint
│   │   ├── dashboard/route.ts     # Metrics API
│   │   └── webhook/route.ts       # Alert webhook
│   └── dashboard/page.tsx         # Dashboard UI
├── lib/
│   ├── agents/
│   │   ├── agent.ts               # Core agent loop
│   │   ├── tools/                 # 35 tools
│   │   ├── rag/                   # RAG V2 system
│   │   ├── memory/                # Vector memory
│   │   └── flywheel/              # Data logging
│   ├── api-key.ts                 # Hardcoded keys
│   └── mcp-client.ts              # MCP client
├── mcp-server.ts                  # MCP server (35 tools)
├── nat/configs/
│   └── dory_workflow.yml          # NAT config
└── start.sh                       # Startup script
```

---

## Security

### PII Guard

Automatically redacts before processing:

| Pattern | Replacement |
|---------|-------------|
| Email | `[EMAIL_REDACTED]` |
| Phone | `[PHONE_REDACTED]` |
| SSN | `[SSN_REDACTED]` |
| Credit Card | `[CREDIT_CARD_REDACTED]` |
| AWS Keys | `[AWS_KEY_REDACTED]` |
| API Keys | `[API_KEY_REDACTED]` |

---

## Troubleshooting

### MCP Server Won't Start

```bash
cd /Users/home/Documents/nvidia-cli
npx tsx mcp-server.ts
# Should print "[nvidia-cli MCP] Server started"
```

### RAG Not Finding Documents

```bash
# Check stats
"rag_stats"

# Re-ingest
"rag_ingest /path/to/project"
```

### Check Logs

```bash
tail -f /tmp/nvidia-cli-dev.log
tail -f /tmp/nvidia-cli-mcp.log
```

---

## License

Private use only.
