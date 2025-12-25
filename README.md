# Dory

Your NVIDIA-Powered AI Co-Worker

Powered by NVIDIA NIM - 36 Custom Tools - 262K Token Context (Cloud) / 1M (Self-Hosted) - RAG + Memory

---

## What is Dory?

Dory is a complete AI-powered coding assistant built from scratch. It's not a wrapper around ChatGPT - it's a fully custom system with:

- 36 hand-built tools for file operations, code search, web research, memory, and more
- A RAG (Retrieval-Augmented Generation) system that indexes your entire codebase
- Persistent vector memory that remembers everything across sessions
- MCP (Model Context Protocol) integration so the same tools work in multiple AI clients
- A data flywheel that logs every interaction for future model fine-tuning

All powered by NVIDIA's newest models.

---

## NVIDIA Model Stack

Four models, one API key from build.nvidia.com:

| Model | Purpose | Details |
|-------|---------|---------|
| Nemotron 3 Nano | Main LLM | 30B MoE (~3.5B active), 262K context (cloud) / 1M (self-hosted), reasoning ON/OFF |
| NV EmbedQA 1B | Embeddings | 2048-dimensional vectors, 8K context per chunk |
| NV RerankQA 1B | Reranking | Re-scores search results, rate limited 1 req/sec |
| Nemotron Nano VL 12B | Vision | 128K context, multi-image reasoning, UI analysis |

---

## Tools (36)

### Project
- `set_project` - Sets the current working directory for all file and bash operations
- `get_project` - Returns the current working directory path

### File System
- `file_read` - Reads file contents or lists directory contents
- `file_write` - Creates or overwrites files with complete content

### System
- `bash` - Executes shell commands on your system

### Reasoning
- `think` - Internal reasoning tool for complex problem solving

### Memory
- `memory` - Stores and retrieves information across conversations
- `entity_memory` - Tracks entities like people, projects, companies, and technologies

### Search
- `google_search` - Searches Google for information
- `parallel_search` - Runs multiple Google searches simultaneously
- `local_docs_search` - Searches local documentation files in your project

### Vision
- `vision_analyze` - Analyzes images or video using NVIDIA's vision model
- `ios_ui_review` - Reviews iOS screenshots for UI/UX issues
- `compare_mockup` - Compares a design mockup to the actual implementation

### RAG
- `rag_ingest` - Adds documents to the knowledge base for later searching
- `rag_search` - Searches your documents using hybrid BM25 + semantic search
- `rag_query` - Asks questions and gets answers based on your documents
- `rag_research` - Deep research with automatic query decomposition
- `rag_stats` - Shows statistics about the RAG knowledge base
- `rag_clear` - Clears all documents from the RAG knowledge base
- `rag_validate` - Validates RAG documents and removes stale entries
- `rag_update` - Updates RAG documents from a source path

### Code
- `github_analyzer` - Clones and analyzes GitHub repositories
- `github_file_reader` - Reads specific files from cloned GitHub repos
- `code_documentation` - Generates documentation for codebases
- `documentation_specialist` - Advanced documentation generation with multiple passes

### Diagrams
- `mermaid_generator` - Creates Mermaid diagrams for architecture visualization
- `quick_diagram` - Fast diagram generation using pre-built templates

### Specialists
- `search_specialist` - Deep multi-source research agent
- `report_planner` - Creates structured outlines for reports and documents
- `section_author` - Writes individual sections of a document
- `report_writer` - Fast full draft generation for reports
- `quality_reviewer` - Evaluates output quality with scores and feedback
- `report_extender` - Merges new findings into existing reports
- `report_compiler` - Final assembly and formatting of reports
- `deduplicate_sources` - Cleans and deduplicates citation lists

---

## Quick Start

1. Clone and install:
```bash
cd nvidia-cli
npm install
```

2. Set your API key in `.env.local`:
```
NVIDIA_API_KEY=nvapi-your-key-here
```

3. Start the server:
```bash
npm run dev
```

4. Open http://localhost:3000

---

## RAG System

Retrieval-Augmented Generation lets Dory search through your own documents before answering.

How it works:
1. Ingestion - Documents are split into chunks and converted to vectors
2. Hybrid Search - BM25 (exact keywords) + Vector (semantic) combined
3. Reranking - NVIDIA's reranker scores results by relevance
4. Generation - AI reads top results and generates an answer

Use `rag_ingest` to index your codebase, then `rag_search` or `rag_query` to search it.

---

## Memory System

Vector-based memory that persists across sessions:
- Semantic storage - Memories are embedded as vectors
- Semantic retrieval - Find relevant memories by meaning
- Entity tracking - Remember people, projects, preferences
- Persistence - Saved to ~/.nvidia-cli/memory/

---

## MCP Integration

The MCP server (`mcp-server.ts`) exposes all 36 tools via Model Context Protocol. This means any MCP-compatible client can use the same tools.

To use with Codex CLI, add to `~/.codex/config.toml`:

```toml
[mcp_servers.nvidia-cli]
command = "npx"
args = ["tsx", "/path/to/nvidia-cli/mcp-server.ts"]
```

---

## Architecture

```
User Input
    |
    v
PII Guard (redacts sensitive data)
    |
    v
Context Gathering (RAG + Memory)
    |
    v
Agent Loop (LLM + Tools)
    |
    v
Response + Flywheel Logging
```

---

## Data Flywheel

Logs every interaction locally for future model improvement:
- Interaction logging - Query, response, tools used, latency
- Quality evaluation - LLM-as-Judge scoring
- Dataset creation - Export to JSONL for fine-tuning

Based on NVIDIA's Data Flywheel Blueprint.

---

## Privacy

- Conversations are sent to NVIDIA's servers for processing
- Files, memory, RAG database, and history are stored locally only
- Tools run on your machine
- PII is automatically redacted before sending

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Settings | Cmd + , |
| Send Message | Enter |
| New Line | Shift + Enter or Ctrl + J |
| Clear Input | Ctrl + U |

---

## License

MIT
