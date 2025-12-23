<p align="center">
  <img src="public/nvidia-logo.webp" alt="Dory" width="120" />
</p>

<h1 align="center">Dory</h1>

<p align="center">
  <strong>Private iOS/SwiftUI Coding Agent powered by NVIDIA NIM</strong>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#nvidia-model-stack">Models</a> •
  <a href="#rag-system-v2">RAG</a> •
  <a href="#tools-40">Tools</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#data-flywheel">Flywheel</a> •
  <a href="#environment">Environment</a>
</p>

---

## Project Purpose

> **Dory is a private enterprise iOS/SwiftUI coding agent designed for large codebase handling.**
>
> This application is exclusively for private use by a single developer. The primary objective is to eliminate traditional constraints that have historically limited AI assistants on exceptionally large iOS SwiftUI projects.
>
> **Target use case:** 100k+ line iOS projects with 500+ Swift files.

### Why This Architecture

| Constraint | Traditional AI | Dory's Solution |
|------------|----------------|-----------------|
| Context limits | 8-32k tokens | 1M tokens via Nemotron 3 Nano |
| File awareness | Single file at a time | RAG indexes entire Xcode project |
| Session memory | Forgets between chats | Persistent memory across sessions |
| Code search | Semantic only | Hybrid BM25 + Vector (exact + semantic) |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/caser-legal/nvidia-cli.git
cd nvidia-cli
npm install

# Add your NVIDIA API key (single key for everything)
echo "NVIDIA_API_KEY=nvapi-xxx" > .env.local

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Single API Key

**One key powers everything:**
- LLM inference (Nemotron 3 Nano 30B)
- Embeddings (NV-EmbedQA 1B v2)
- Reranking (NV-RerankQA 1B v2)
- Vision analysis (Nemotron Nano VL 12B v2)

Get your key from [build.nvidia.com](https://build.nvidia.com)

---

## NVIDIA Model Stack

All models accessed via single `NVIDIA_API_KEY`:

| Component | Model | Purpose |
|-----------|-------|---------|
| **Main LLM** | `nvidia/nemotron-3-nano-30b-a3b` | 1M context, MoE (3B active) |
| **Embeddings** | `nvidia/llama-3.2-nv-embedqa-1b-v2` | 2048-dim vectors for RAG |
| **Reranker** | `nvidia/llama-3.2-nv-rerankqa-1b-v2` | Re-scores retrieval results |
| **Vision** | `nvidia/nemotron-nano-12b-v2-vl` | UI analysis, mockup comparison |

### Why Nemotron 3 Nano?

- **MoE Architecture**: 30B total, only 3B active per token
- **1M native context**: Hold ~750k lines of Swift at once
- **3.3x faster** than dense models of similar quality
- **Hybrid Mamba-Transformer**: Efficient long-context processing

### Context Limits

| Backend | Limit | Notes |
|---------|-------|-------|
| Hosted API | 262K tokens | Free tier limit |
| Self-hosted NIM | 1M tokens | Full capability |
| Local Ollama | 1M tokens | Set `USE_LOCAL_LLM=true` |

---

## RAG System V2

Full implementation based on **NVIDIA RAG Blueprint (Dec 2025)**.

### Architecture

```
Documents → Chunking → Embeddings → Vector Store
                                        ↓
Query → BM25 + Vector → Rerank → Top K → Generate
         (Hybrid)       (100→10)
```

### Key Features

| Feature | Implementation |
|---------|----------------|
| **Hybrid Retrieval** | BM25 (lexical) + Vector (semantic) with RRF fusion |
| **ContextualCompressionRetriever** | Wide net (100) → Rerank → Narrow (10) |
| **Swift-Aware Chunking** | Respects `class`, `struct`, `func`, `extension` boundaries |
| **Query Decomposition** | Breaks complex queries into sub-queries |
| **Self-Correction Loop** | Rewrites queries if results aren't relevant |

### Chunking Config (iOS Profile)

```typescript
{
  chunkSize: 800,        // chars per chunk
  chunkOverlap: 120,     // overlap for context
  separators: [
    '\nclass ', '\nstruct ', '\nenum ', '\nprotocol ',
    '\nextension ', '\nfunc ', '\n@Observable', ...
  ]
}
```

### RAG Files

| File | Purpose |
|------|---------|
| `lib/agents/rag/pipeline-v2.ts` | Main RAG pipeline with NVIDIA best practices |
| `lib/agents/rag/config.ts` | Profiles: iOS, Research, Chatbot |
| `lib/agents/rag/hybrid-retriever.ts` | BM25 + Vector with RRF fusion |
| `lib/agents/rag/contextual-retriever.ts` | Wide net → Rerank → Narrow |
| `lib/agents/rag/text-splitter.ts` | RecursiveCharacterTextSplitter |
| `lib/agents/rag/embeddings.ts` | NVIDIA NV-EmbedQA + NV-RerankQA |
| `lib/agents/rag/reflection.ts` | Relevance/groundedness checking |
| `lib/agents/rag/query-decomposition.ts` | Complex query breakdown |

### Why Hybrid Retrieval?

For iOS/Swift code search:
- **BM25**: Exact matches for `viewDidLoad`, `@Observable`, `NavigationStack`
- **Vector**: Semantic matches for "how to handle state management"
- **RRF Fusion**: Combines both with weighted scores

---

## Tools (40)

### File & System (5)

| Tool | Description |
|------|-------------|
| `set_project` | Set working directory |
| `get_project` | Get current directory |
| `file_read` | Read files/directories |
| `file_write` | Create/edit files |
| `bash` | Execute shell commands |

### Vision Analysis (3)

| Tool | Description |
|------|-------------|
| `vision_analyze` | Analyze images/video with Nemotron VL |
| `ios_ui_review` | Check alignment, spacing, accessibility |
| `compare_mockup` | Compare Figma mockup to implementation |

### RAG (8)

| Tool | Description |
|------|-------------|
| `rag_ingest` | Add documents to knowledge base |
| `rag_search` | Hybrid BM25+Vector search |
| `rag_query` | Ask questions with RAG context |
| `rag_research` | Deep research with decomposition |
| `rag_stats` | Show database statistics |
| `rag_clear` | Clear all documents |
| `rag_validate` | Validate documents (remove stale) |
| `rag_update` | Update documents from source |

### Search (5)

| Tool | Description |
|------|-------------|
| `google_search` | Google Custom Search |
| `tavily_search` | AI-optimized search |
| `parallel_search` | Multiple Google searches |
| `parallel_tavily_search` | Multiple Tavily searches |
| `local_docs_search` | Search local docs |

### Memory (2)

| Tool | Description |
|------|-------------|
| `memory` | Store/retrieve across sessions |
| `entity_memory` | Track people, projects, companies |

### Code & Docs (4)

| Tool | Description |
|------|-------------|
| `github_analyzer` | Clone and analyze repos |
| `github_file_reader` | Read files from repos |
| `code_documentation` | Generate codebase docs |
| `documentation_specialist` | Advanced documentation |

### Diagrams (2)

| Tool | Description |
|------|-------------|
| `mermaid_generator` | Create Mermaid diagrams |
| `quick_diagram` | Fast diagrams from templates |

### Specialist Agents (8)

| Tool | Description |
|------|-------------|
| `search_specialist` | Deep multi-source research |
| `report_planner` | Structured outline creation |
| `section_author` | Individual section writing |
| `report_writer` | Fast full draft generation |
| `quality_reviewer` | Output evaluation (0-10) |
| `report_extender` | Merge new findings |
| `report_compiler` | Final assembly |
| `deduplicate_sources` | Clean citations |

### Reflection (2)

| Tool | Description |
|------|-------------|
| `reflect_on_report` | Self-critique and improve |
| `extend_report` | Add new sections to report |

### Other (1)

| Tool | Description |
|------|-------------|
| `think` | Internal reasoning |

---

## Architecture

### System Flow

```
User Query
    ↓
🛡️ PII Guard (redacts sensitive data)
    ↓
🧠 Retrieval Router (decides: RAG / Memory / Search)
    ↓
📚 Unified Context (aggregates all sources)
    ↓
🤖 Agent Core (40 tools)
    ↓
📊 Data Flywheel (logs for improvement)
    ↓
Response
```

### Key Files

| File | Purpose |
|------|---------|
| `app/api/agent-chat/route.ts` | Main agent endpoint |
| `lib/agents/agent.ts` | Core agent loop |
| `lib/agents/unified-context.ts` | Context aggregation |
| `lib/agents/retrieval-router.ts` | Query routing |
| `lib/context-manager.ts` | Token tracking |
| `lib/nvidia.ts` | Model configs |

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
| FlywheelLogger | `lib/agents/flywheel/logger.ts` | Captures interactions |
| DatasetCreator | `lib/agents/flywheel/dataset-creator.ts` | Train/eval/test splits |
| FlywheelEvaluator | `lib/agents/flywheel/evaluator.ts` | LLM-as-Judge scoring |
| FeedbackOptimizer | `lib/agents/feedback-optimizer.ts` | Golden Examples from failures |
| AutoRAGUpdater | `lib/agents/rag/auto-updater.ts` | High-quality → RAG sync |

### Future Use

Logged data can be used for:
- Fine-tuning smaller models (LoRA)
- Identifying common failure patterns
- Measuring quality over time

---

## Memory System

| Type | Persistence | Location |
|------|-------------|----------|
| **Short-term** | Session only | In-memory |
| **Long-term** | Permanent | `~/.nvidia-cli/memory.json` |
| **Entity** | Permanent | `~/.nvidia-cli/memory.json` |
| **RAG** | Permanent | `.rag-store.json` |

---

## Security

### PII Guard

Automatically redacts before processing:

| Pattern | Replacement |
|---------|-------------|
| Email | `[EMAIL_REDACTED]` |
| Phone | `[PHONE_REDACTED]` |
| API keys | `[API_KEY_REDACTED]` |
| IP addresses | `[IP_REDACTED]` |

### Not Using (Private Use)

- Nemotron Safety Guard (no external users)
- Content moderation (single user)
- Jailbreak detection (trusted environment)

---

## Environment

### Required

```env
NVIDIA_API_KEY=nvapi-xxx    # Single key for all NVIDIA services
```

### Optional

```env
# Web search (if using)
TAVILY_API_KEY=tvly-xxx
GOOGLE_API_KEY=xxx
GOOGLE_CSE_ID=xxx

# Local LLM (instead of hosted API)
USE_LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434
LOCAL_EMBED_URL=http://192.168.50.50:8000
```

---

## Project Structure

```
nvidia-cli/
├── app/
│   ├── page.tsx                    # Main interface
│   ├── settings/page.tsx           # Settings
│   └── api/
│       ├── agent-chat/route.ts     # Main endpoint (40 tools)
│       └── chat/route.ts           # Alternative endpoint
│
├── lib/
│   ├── agents/
│   │   ├── agent.ts                # Core agent loop
│   │   ├── unified-context.ts      # Context aggregation
│   │   ├── retrieval-router.ts     # Query routing
│   │   │
│   │   ├── tools/                  # 40 tools
│   │   │   ├── vision-analysis.ts  # VLM tools
│   │   │   ├── rag-tools.ts        # RAG tools (8)
│   │   │   ├── specialist-agents.ts # Multi-agent (8)
│   │   │   └── ...
│   │   │
│   │   ├── rag/                    # RAG V2 system
│   │   │   ├── pipeline-v2.ts      # Main pipeline
│   │   │   ├── config.ts           # Profiles
│   │   │   ├── hybrid-retriever.ts # BM25 + Vector
│   │   │   ├── contextual-retriever.ts
│   │   │   ├── text-splitter.ts    # Swift-aware
│   │   │   ├── embeddings.ts       # NVIDIA models
│   │   │   ├── reflection.ts       # Self-correction
│   │   │   └── query-decomposition.ts
│   │   │
│   │   └── flywheel/               # Data logging
│   │       ├── logger.ts
│   │       ├── evaluator.ts
│   │       └── dataset-creator.ts
│   │
│   ├── nvidia.ts                   # Model configs
│   ├── context-manager.ts          # Token management
│   └── security/
│       └── pii-guard.ts            # PII redaction
│
├── components/                     # React components
├── public/                         # Static assets
└── .env.local                      # NVIDIA_API_KEY here
```

---

## Alignment with NVIDIA Blueprints

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
| Vision Analysis | Nemotron Nano VL 12B v2 | ✅ |

---

## License

Private use only.
