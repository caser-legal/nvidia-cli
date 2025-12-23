# Dory - Complete System Documentation

## Overview

**Dory** is a private iOS/SwiftUI coding agent built on NVIDIA NIM. Self-contained system with 40 built-in tools - no MCP needed.

**Owner:** Single user (private dev tool)
**Purpose:** Large iOS codebase handling (100k+ lines, 500+ files)

---

## Architecture

```
YOU  →  Web UI (localhost:3000)  →  Agent (TypeScript)  →  NVIDIA NIM API
                                          │
                                          ├──→ File System (file_read, file_write)
                                          ├──→ Shell (bash)
                                          ├──→ RAG (8 tools - hybrid BM25+Vector)
                                          ├──→ Vision (3 tools - Nemotron VL)
                                          ├──→ Search (5 tools - Google, Google)
                                          ├──→ Memory (2 tools - vector-based)
                                          ├──→ Code (4 tools - GitHub, docs)
                                          ├──→ Diagrams (2 tools - Mermaid)
                                          ├──→ Specialists (8 sub-agents)
                                          ├──→ Reflection (2 tools)
                                          └──→ Reasoning (think)
                                          │
                                          ▼
                                    Response (streamed)
```

---

## NVIDIA Model Stack

All models via single `NVIDIA_API_KEY`:

| Component | Model ID | Purpose |
|-----------|----------|---------|
| **Main LLM** | `nvidia/nemotron-3-nano-30b-a3b` | 1M context, MoE (3.5B active) |
| **Embeddings** | `nvidia/llama-3.2-nv-embedqa-1b-v2` | 2048-dim vectors for RAG |
| **Reranker** | `nvidia/llama-3.2-nv-rerankqa-1b-v2` | Re-scores retrieval results |
| **Vision** | `nvidia/nemotron-nano-12b-v2-vl` | UI analysis, mockup comparison |

### Context Limits

| Backend | Limit |
|---------|-------|
| Hosted API (integrate.api.nvidia.com) | 262K tokens |
| Self-hosted NIM | 1M tokens |
| Local Ollama | 1M tokens |

---

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DORY WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER INPUT                                                              │
│     └── Web UI at localhost:3000                                            │
│         └── POST /api/agent-chat                                            │
│                                                                             │
│  2. SECURITY LAYER                                                          │
│     └── PII Guard: Redacts emails, phones, API keys, IPs                    │
│                                                                             │
│  3. CONTEXT LAYER                                                           │
│     ├── Retrieval Router: Decides RAG vs Web vs Memory                      │
│     ├── RAG Pipeline V2 (Hybrid BM25 + Vector + Rerank)                     │
│     ├── Vector Memory (semantic retrieval, NVIDIA pattern)                  │
│     └── Entity Memory (people, projects, companies)                         │
│                                                                             │
│  4. LLM CALL                                                                │
│     └── NVIDIA NIM API                                                      │
│         └── Model: nvidia/nemotron-3-nano-30b-a3b                           │
│         └── Returns: Text + Tool calls                                      │
│                                                                             │
│  5. TOOL EXECUTION (38 tools)                                               │
│     ├── File System: file_read, file_write                                  │
│     ├── Shell: bash                                                         │
│     ├── RAG: rag_ingest, rag_search, rag_query, etc.                        │
│     ├── Vision: vision_analyze, ios_ui_review, compare_mockup               │
│     ├── Search: google_search, google_search, parallel variants             │
│     ├── Memory: memory, entity_memory                                       │
│     ├── Code: github_analyzer, code_documentation                           │
│     ├── Diagrams: mermaid_generator, quick_diagram                          │
│     └── Specialists: 8 sub-agents for complex tasks                         │
│                                                                             │
│  6. LOOP: Tool results → Back to LLM → More tools or final response         │
│                                                                             │
│  7. LEARNING LAYER                                                          │
│     ├── Flywheel Logger: Logs all interactions                              │
│     ├── Flywheel Evaluator: LLM-as-Judge scoring                            │
│     └── Dataset Creator: Train/eval/test splits                             │
│                                                                             │
│  8. RESPONSE: Streamed back to Web UI                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tools (38 Total)

### Project (2)
| Tool | File | Purpose |
|------|------|---------|
| `set_project` | project.ts | Set working directory |
| `get_project` | project.ts | Get current directory |

### File System (2)
| Tool | File | Purpose |
|------|------|---------|
| `file_read` | file-read.ts | Read files/directories |
| `file_write` | file-write.ts | Create/edit files |

### System (1)
| Tool | File | Purpose |
|------|------|---------|
| `bash` | bash.ts | Execute shell commands |

### Reasoning (1)
| Tool | File | Purpose |
|------|------|---------|
| `think` | think.ts | Internal reasoning |

### Memory (2)
| Tool | File | Purpose |
|------|------|---------|
| `memory` | unified-memory.ts | Vector-based semantic memory |
| `entity_memory` | memory.ts | Track entities |

### Search (3)
| Tool | File | Purpose |
|------|------|---------|
| `google_search` | google-search.ts | Google Custom Search |
| `parallel_search` | parallel-search.ts | Multiple Google searches |
| `local_docs_search` | local-docs-search.ts | Search local docs |

### Vision (3)
| Tool | File | Purpose |
|------|------|---------|
| `vision_analyze` | vision-analysis.ts | Analyze images/video |
| `ios_ui_review` | vision-analysis.ts | Check iOS UI issues |
| `compare_mockup` | vision-analysis.ts | Compare mockup to implementation |

### RAG (8)
| Tool | File | Purpose |
|------|------|---------|
| `rag_ingest` | rag-tools.ts | Add documents to knowledge base |
| `rag_search` | rag-tools.ts | Hybrid BM25+Vector search |
| `rag_query` | rag-tools.ts | Ask questions with RAG context |
| `rag_research` | rag-tools.ts | Deep research with decomposition |
| `rag_stats` | rag-tools.ts | Show database statistics |
| `rag_clear` | rag-tools.ts | Clear all documents |
| `rag_validate` | rag-tools.ts | Remove stale documents |
| `rag_update` | rag-tools.ts | Update documents from source |

### Code (4)
| Tool | File | Purpose |
|------|------|---------|
| `github_analyzer` | github-analyzer.ts | Clone and analyze repos |
| `github_file_reader` | github-analyzer.ts | Read files from repos |
| `code_documentation` | code-documentation.ts | Generate docs |
| `documentation_specialist` | code-documentation.ts | Advanced documentation |

### Diagrams (2)
| Tool | File | Purpose |
|------|------|---------|
| `mermaid_generator` | mermaid-generator.ts | Create Mermaid diagrams |
| `quick_diagram` | mermaid-generator.ts | Fast diagram templates |

### Specialists (8)
| Tool | File | Purpose |
|------|------|---------|
| `search_specialist` | specialist-agents.ts | Deep multi-source research |
| `report_planner` | specialist-agents.ts | Create structured outlines |
| `section_author` | specialist-agents.ts | Write individual sections |
| `report_writer` | specialist-agents.ts | Fast full draft |
| `quality_reviewer` | specialist-agents.ts | Evaluate output (0-10) |
| `report_extender` | specialist-agents.ts | Merge new findings |
| `report_compiler` | specialist-agents.ts | Final assembly |
| `deduplicate_sources` | specialist-agents.ts | Clean citations |

### Reflection (2)
| Tool | File | Purpose |
|------|------|---------|
| `reflect_on_report` | reflection.ts | Self-critique |
| `extend_report` | reflection.ts | Add new sections |

---

## RAG System V2

Based on **NVIDIA RAG Blueprint (Dec 2025)**.

### Architecture

```
Documents → Swift-Aware Chunking → Embeddings → Vector Store + BM25 Index
                                                        ↓
Query → Hybrid Search (BM25 + Vector) → RRF Fusion → Rerank → Top K → Generate
              (100 candidates)                        (→10)
```

### Key Features

| Feature | Implementation |
|---------|----------------|
| **Hybrid Retrieval** | BM25 (lexical) + Vector (semantic) with Reciprocal Rank Fusion |
| **ContextualCompressionRetriever** | Wide net (100) → Rerank → Narrow (10) |
| **Swift-Aware Chunking** | Respects `class`, `struct`, `func`, `extension` boundaries |
| **Query Decomposition** | Breaks complex queries into sub-queries |
| **Self-Correction Loop** | Rewrites queries if results aren't relevant |
| **Persistence** | Saves to `.rag-store.json` (survives restarts) |

### RAG Files

| File | Purpose |
|------|---------|
| `lib/agents/rag/pipeline-v2.ts` | Main RAG pipeline |
| `lib/agents/rag/config.ts` | Profiles: iOS, Research, Chatbot |
| `lib/agents/rag/hybrid-retriever.ts` | BM25 + Vector with RRF |
| `lib/agents/rag/contextual-retriever.ts` | Wide net → Rerank → Narrow |
| `lib/agents/rag/text-splitter.ts` | RecursiveCharacterTextSplitter |
| `lib/agents/rag/embeddings.ts` | NVIDIA NV-EmbedQA + NV-RerankQA |
| `lib/agents/rag/reflection.ts` | Relevance/groundedness checking |
| `lib/agents/rag/query-decomposition.ts` | Complex query breakdown |

---

## Data Flywheel

Based on **NVIDIA Data Flywheel Blueprint**.

### What Gets Logged

- Timestamp, session ID
- User query, agent response
- Tools called and results
- Token counts, latency
- Quality score (if evaluated)

### Components

| Component | File | Purpose |
|-----------|------|---------|
| FlywheelLogger | `flywheel/logger.ts` | Captures interactions |
| DatasetCreator | `flywheel/dataset-creator.ts` | Train/eval/test splits |
| FlywheelEvaluator | `flywheel/evaluator.ts` | LLM-as-Judge scoring |
| FeedbackOptimizer | `feedback-optimizer.ts` | Golden Examples from failures |

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/agents/agent.ts` | Core agent loop, tool execution |
| `lib/agents/unified-context.ts` | Combines RAG + Memory |
| `lib/agents/retrieval-router.ts` | Decides where to get context |
| `lib/nvidia.ts` | NVIDIA NIM API client, model configs |
| `lib/context-manager.ts` | Token tracking, truncation |
| `lib/security/pii-guard.ts` | PII redaction |
| `app/api/agent-chat/route.ts` | Main API endpoint |

---

## Storage

| Path | Purpose |
|------|---------|
| `~/.nvidia-cli/memory/vector-memory.json` | Vector memory store |
| `.rag-store.json` | RAG vector store (persisted) |
| `prisma/dev.db` | Conversations, sessions |
| `.env.local` | API keys |

---

## Environment Variables

```env
# Required
NVIDIA_API_KEY=nvapi-xxx

# Optional - Web search (Google Custom Search)
GOOGLE_API_KEY=xxx
GOOGLE_CSE_ID=xxx

# Optional - Local LLM
USE_LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434/v1
LOCAL_EMBED_URL=http://192.168.50.50:8000
```

---

## Running

```bash
npm run dev          # Start on localhost:3000
./bin/dory "query"   # CLI mode (if available)
```

---

## NVIDIA Blueprint Alignment

| NVIDIA Pattern | Dory Implementation | Status |
|----------------|---------------------|--------|
| RecursiveCharacterTextSplitter | SwiftTextSplitter | ✅ |
| ContextualCompressionRetriever | Wide net → Rerank → Narrow | ✅ |
| Hybrid Retrieval (BM25 + FAISS) | BM25 + Vector with RRF | ✅ |
| NV-EmbedQA 1B v2 | Embeddings | ✅ |
| NV-RerankQA 1B v2 | Reranking | ✅ |
| Query Decomposition | Complex query breakdown | ✅ |
| Self-Correction Loop | Relevance checking | ✅ |
| Data Flywheel Logging | FlywheelLogger | ✅ |
| LLM-as-Judge | FlywheelEvaluator | ✅ |
| Nemotron Nano VL | Vision tools | ✅ |

---

## Not Using (by design)

- **MCP**: Tools are built-in, not exposed via protocol
- **NeMo Agent Toolkit**: Custom TS agent sufficient for single user
- **Nemotron Safety Guard**: Private use, no external users
- **Content moderation**: Single trusted user
