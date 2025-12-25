<p align="center">
  <img src="public/nvidia-logo.webp" alt="Dory" width="120" />
</p>

<h1 align="center">Dory</h1>

<p align="center">
  <strong>Your NVIDIA Powered Co-Worker</strong><br/>
  <em>Powered by NVIDIA NIM • 35 Custom Tools • 1M Token Context • RAG + Memory</em>
</p>

<p align="center">
  <a href="#-what-is-dory">What is Dory?</a> •
  <a href="#-the-complete-system">Complete System</a> •
  <a href="#-how-it-all-works">How It Works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#nvidia-model-stack">Models</a> •
  <a href="#rag-system-v2">RAG</a> •
  <a href="#tools-36">Tools</a> •
  <a href="#mcp-integration-model-context-protocol">MCP</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#data-flywheel">Flywheel</a>
</p>

---

#  What is Dory?

**Dory is a complete AI-powered coding assistant built from scratch for iOS/SwiftUI development.**

It's not a wrapper around ChatGPT. It's not a simple API call. It's a fully custom system with:

- **36 hand-built tools** for file operations, code search, web research, memory, and more
- **A RAG (Retrieval-Augmented Generation) system** that indexes your entire Xcode project
- **Persistent vector memory** that remembers everything across sessions
- **MCP (Model Context Protocol) integration** so the same tools work in multiple AI clients
- **A data flywheel** that logs every interaction for future model fine-tuning

All powered by **NVIDIA's newest models** with up to **1 million token context windows**.

---

#  The Complete System

## What We Built

This project started as a simple chat interface and evolved into a full AI agent platform. Here's everything that exists:

### 1. The Web Application (Dory)

A Next.js web app running at `localhost:3000` that provides:

- **Chat interface** - Talk to the AI, see tool calls in real-time
- **Agent system** - The AI can use 36 tools to accomplish tasks
- **RAG integration** - Index and search your entire codebase
- **Memory system** - The AI remembers past conversations
- **Settings page** - Configure API keys, view stats

### 2. The MCP Server

A standalone server (`mcp-server.ts`) that exposes all 36 tools via the **Model Context Protocol**. This means:

- **Codex CLI** (OpenAI's terminal AI) can use our tools
- **Dory web app** can use our tools
- **Any future MCP-compatible client** can use our tools

One tool implementation, unlimited clients.

### 3. The Tool Library

36 custom tools organized into categories:

| Category | Tools | What They Do |
|----------|-------|--------------|
| **File System** | `file_read`, `file_write`, `bash` | Read/write files, run shell commands |
| **Project** | `set_project`, `get_project` | Set working directory context |
| **RAG** | `rag_ingest`, `rag_search`, `rag_query`, `rag_research`, `rag_stats`, `rag_clear`, `rag_validate`, `rag_update` | Index documents, search with hybrid retrieval, ask questions |
| **Search** | `google_search`, `parallel_search`, `local_docs_search` | Web search, multi-query search, local documentation |
| **Memory** | `memory`, `entity_memory`, `unified_memory` | Store/retrieve information semantically |
| **Code** | `code_documentation`, `documentation_specialist` | Generate documentation for codebases |
| **GitHub** | `github_analyzer`, `github_file_reader` | Analyze repos, read files from GitHub |
| **Diagrams** | `mermaid_generator`, `quick_diagram` | Create architecture diagrams |
| **Reports** | `reflection`, `extend_report`, `report_planner`, `section_author`, `report_compiler` | Multi-step report generation |
| **Flywheel** | `flywheel_log`, `flywheel_stats`, `flywheel_export`, `flywheel_create_dataset` | Log interactions, export training data |
| **Reasoning** | `think` | Internal reasoning step |

### 4. The RAG System

A complete implementation of NVIDIA's RAG Blueprint:

- **Document ingestion** - Chunks Swift files respecting class/struct/func boundaries
- **Hybrid retrieval** - Combines BM25 (exact keyword) + Vector (semantic) search
- **Reranking** - Uses NVIDIA's reranker model to score results
- **Query decomposition** - Breaks complex questions into sub-queries
- **Self-correction** - Rewrites queries if results aren't relevant

### 5. The Memory System

Vector-based memory that persists across sessions:

- **Semantic storage** - Memories are embedded as vectors
- **Semantic retrieval** - Find relevant memories by meaning, not keywords
- **Entity tracking** - Remember people, projects, preferences
- **Persistence** - Saved to `~/.nvidia-cli/memory/`

### 6. The Data Flywheel

Logs every interaction for future model improvement:

- **Interaction logging** - Query, response, tools used, latency
- **Quality evaluation** - LLM-as-Judge scoring
- **Dataset creation** - Export to JSONL for fine-tuning
- **Train/eval/test splits** - Ready for model training

---

#  How It All Works

## The Flow: From Your Question to the Answer

Here's exactly what happens when you ask Dory a question:

### Step 1: You Send a Message

```
"Read my AppDelegate.swift and explain what it does"
```

### Step 2: Security Check (PII Guard)

Before anything else, your message is scanned for sensitive data:

- Email addresses → `[EMAIL_REDACTED]`
- Phone numbers → `[PHONE_REDACTED]`
- API keys → `[API_KEY_REDACTED]`

This protects you from accidentally sending secrets to the AI.

### Step 3: Context Gathering

The system decides what context the AI needs:

- **Need codebase knowledge?** → Query the RAG system
- **Need past information?** → Query the memory system
- **Need current information?** → Run a web search

All relevant context is gathered and formatted.

### Step 4: Agent Loop

The AI receives your message + context + list of available tools.

It then enters a loop:

1. **Think** - Decide what to do
2. **Call tools** - If needed, execute tools (file_read, bash, etc.)
3. **Get results** - Tool outputs are added to the conversation
4. **Repeat** - Until the task is complete
5. **Respond** - Final answer is generated

### Step 5: Tool Execution

When the AI calls a tool, here's what happens:

```typescript
// AI says: "I need to read AppDelegate.swift"
{
  "tool": "file_read",
  "arguments": {
    "operation": "read",
    "path": "/Users/home/Documents/iOS/MyApp/AppDelegate.swift"
  }
}

// Tool executes and returns the file contents
// AI now has the file in its context
```

### Step 6: Response Generation

With all the information gathered, the AI generates a response:

```
"Your AppDelegate.swift sets up the application lifecycle. Here's what each method does:

1. `application(_:didFinishLaunchingWithOptions:)` - Called when the app starts...
2. `applicationWillResignActive(_:)` - Called when the app is about to become inactive...
..."
```

### Step 7: Flywheel Logging

The entire interaction is logged:

- Your question
- The AI's response
- Which tools were called
- How long it took
- Token counts

This data can later be used to fine-tune a smaller, faster model.

---

## The MCP Connection: One Server, Multiple Clients

### The Problem We Solved

We built 36 amazing tools. But they only worked in the web app.

Then we wanted to use them in **Codex CLI** (OpenAI's terminal AI). We'd have to rewrite everything!

### The Solution: MCP

**Model Context Protocol (MCP)** is a standard for AI tool communication. Think of it like USB - one standard that works everywhere.

We created `mcp-server.ts` which:

1. **Starts as a subprocess** - Spawned by any MCP client
2. **Exposes all 36 tools** - Via JSON-RPC over stdio
3. **Handles tool calls** - Executes tools and returns results

Now both **Codex CLI** and **Dory web app** use the exact same tools:

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Codex CLI  │────▶│   MCP Server    │────▶│  35 Tools    │
└─────────────┘     │ (mcp-server.ts) │     │              │
                    │                 │     │ • file_read  │
┌─────────────┐     │   JSON-RPC      │     │ • bash       │
│  Dory Web   │────▶│   over stdio    │     │ • rag_search │
└─────────────┘     └─────────────────┘     │ • memory     │
                                            │ • ...        │
                                            └──────────────┘
```

### Codex CLI Configuration

To use our tools in Codex CLI, add to `~/.codex/config.toml`:

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
env = { NGC_API_KEY = "${NGC_API_KEY}", NVIDIA_API_KEY = "${NGC_API_KEY}" }
```

Now when you run `codex`, it has access to all 36 tools!

---

## The NVIDIA Stack: Four Models, One API Key

Everything runs on NVIDIA's NIM (NVIDIA Inference Microservices) platform.

### The Models

| Model | Purpose | Why It's Special |
|-------|---------|------------------|
| **Nemotron 3 Nano 30B** | Main LLM | 1M token context, MoE architecture (only 3.5B params active per token) |
| **NV-EmbedQA 1B v2** | Embeddings | 2048-dimensional vectors for RAG and memory |
| **NV-RerankQA 1B v2** | Reranking | Re-scores search results for better relevance |
| **Nemotron Nano VL 12B v2** | Vision | Analyzes iOS screenshots, compares mockups |

### One API Key

All four models are accessed with a single `NVIDIA_API_KEY` from [build.nvidia.com](https://build.nvidia.com).

```env
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

That's it. One key, four models, unlimited possibilities.

---

## The RAG System: Your Entire Codebase, Searchable

### What is RAG?

**Retrieval-Augmented Generation** means the AI can search through documents before answering.

Instead of relying only on what it was trained on, it retrieves relevant information from YOUR codebase.

### How It Works

#### 1. Ingestion

When you run `rag_ingest`, your Swift files are:

1. **Split into chunks** - 800 characters each, respecting code boundaries
2. **Embedded** - Converted to 2048-dimensional vectors
3. **Indexed** - Stored in both vector store AND BM25 index

#### 2. Retrieval (Hybrid Search)

When you search, two things happen in parallel:

- **BM25 Search** - Exact keyword matching ("viewDidLoad", "@Observable")
- **Vector Search** - Semantic similarity ("state management" finds "@State")

Results are combined using **Reciprocal Rank Fusion (RRF)**.

#### 3. Reranking

The top 100 results are sent to NVIDIA's reranker model, which scores them by relevance.

Only the top 10 make it to the AI.

#### 4. Generation

The AI receives your question + the 10 most relevant code chunks, and generates an answer with citations.

### Swift-Aware Chunking

The text splitter knows Swift syntax:

```typescript
separators: [
  '\nclass ', '\nstruct ', '\nenum ', '\nprotocol ',
  '\nextension ', '\nfunc ', '\n@Observable', ...
]
```

This means a function won't be split in the middle - it stays together as one chunk.

---

## The Memory System: It Remembers Everything

### The Problem

Traditional AI forgets everything between sessions. You tell it your preferences, your project structure, your coding style - and next time, it's gone.

### The Solution: Vector Memory

Every piece of information is:

1. **Embedded** - Converted to a vector using NV-EmbedQA
2. **Stored** - Saved to `~/.nvidia-cli/memory/vector-memory.json`
3. **Retrieved semantically** - When relevant, it's pulled back into context

### Example

You tell Dory: "I prefer using @Observable over ObservableObject"

Later, you ask: "How should I handle state in this view?"

Dory retrieves the memory and responds with `@Observable` patterns, not the old `ObservableObject` way.

---

## The Data Flywheel: Learning From Every Interaction

### What Gets Logged

Every conversation is recorded:

```json
{
  "timestamp": "2024-12-24T00:30:00Z",
  "userMessage": "How do I fix this SwiftUI bug?",
  "assistantResponse": "The issue is...",
  "toolCalls": [
    { "name": "file_read", "args": {...}, "result": "..." }
  ],
  "tokenUsage": { "prompt": 1500, "completion": 800 },
  "latencyMs": 3200
}
```

### Why It Matters

This data can be used to:

1. **Fine-tune smaller models** - Train a 1B model on your specific use cases
2. **Identify failure patterns** - See where the AI struggles
3. **Measure quality over time** - Track improvements

### LLM-as-Judge

Optionally, each response can be scored by the AI itself:

- Helpfulness (0-10)
- Accuracy (0-10)
- Completeness (0-10)
- Clarity (0-10)

High-scoring interactions become training data. Low-scoring ones get reviewed.

---

#  The Result

## What You Can Do Now

### With Dory (Web App)

- Chat with an AI that has access to 36 tools
- Index your entire iOS project with RAG
- Search code semantically AND by keyword
- Generate documentation automatically
- Create architecture diagrams
- Research topics with parallel web searches
- Have the AI remember your preferences

### With Codex CLI

- Use the same 36 tools in your terminal
- Powered by NVIDIA's Nemotron 3 Nano
- Full MCP integration
- Works alongside your existing workflow

### For the Future

- Export training data for fine-tuning
- Add new tools easily (just add to mcp-server.ts)
- Connect any MCP-compatible client

---

#  By The Numbers

| Metric | Value |
|--------|-------|
| **Tools** | 35 custom implementations |
| **Context Window** | 1,000,000 tokens (Nemotron 3 Nano) |
| **Embedding Dimensions** | 2,048 (NV-EmbedQA) |
| **RAG Chunk Size** | 800 characters |
| **RAG Chunk Overlap** | 120 characters |
| **Retrieval Candidates** | 100 → Rerank → 10 |
| **Quality Threshold** | 7/10 (LLM-as-Judge score for training data) |
| **API Keys Required** | 1 (NVIDIA) + 2 optional (Google) |
| **Lines of Code** | ~15,000+ TypeScript |

---

# 🎓 What We Learned

Building this system taught us:

1. **Tools are the value** - The orchestration layer (MCP) is standard; the tools are what matter
2. **Hybrid search wins** - BM25 + Vector beats either alone for code search
3. **Memory needs vectors** - Keyword-based memory doesn't work; semantic retrieval does
4. **One server, many clients** - MCP lets you write tools once, use everywhere
5. **Log everything** - The flywheel data will be invaluable for fine-tuning

---

# 🔮 What's Next

- **Fine-tune a smaller model** on flywheel data
- **Add more specialist agents** for specific tasks
- **Improve RAG** with better chunking strategies
- **Build iOS app** for mobile access
- **Add voice input** for hands-free coding

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

```mermaid
flowchart LR
    subgraph API["NVIDIA NIM API"]
        KEY[NVIDIA_API_KEY]
    end

    subgraph Models["Model Stack"]
        KEY --> LLM[" Nemotron 3 Nano 30B<br/>Main LLM<br/>1M context, MoE"]
        KEY --> EMB[" NV-EmbedQA 1B v2<br/>Embeddings<br/>2048 dimensions"]
        KEY --> RR[" NV-RerankQA 1B v2<br/>Reranker<br/>Score refinement"]
        KEY --> VIS["👁️ Nemotron Nano VL 12B v2<br/>Vision<br/>UI analysis"]
    end

    subgraph Usage["Usage"]
        LLM --> CHAT[Chat & Reasoning]
        LLM --> TOOLS[Tool Calling]
        EMB --> RAG_E[RAG Indexing]
        EMB --> RAG_Q[RAG Query]
        RR --> RAG_R[RAG Reranking]
        VIS --> UI[iOS UI Review]
        VIS --> MOCK[Mockup Comparison]
    end

    style API fill:#76b900
    style Models fill:#1a1a2e
    style Usage fill:#2d3436
```

| Component | Model | Purpose |
|-----------|-------|---------|
| **Main LLM** | `nvidia/nemotron-3-nano-30b-a3b` | 1M context, MoE (3.5B active) |
| **Embeddings** | `nvidia/llama-3.2-nv-embedqa-1b-v2` | 2048-dim vectors for RAG |
| **Reranker** | `nvidia/llama-3.2-nv-rerankqa-1b-v2` | Re-scores retrieval results |
| **Vision** | `nvidia/nemotron-nano-12b-v2-vl` | UI analysis, mockup comparison |

### Why Nemotron 3 Nano?

NVIDIA's newest model with highest compute efficiency and accuracy for agentic AI systems.

- **Fully Open**: Open weights, datasets, and training recipes for maximum customization
- **MoE Architecture**: 30B total, ~3.5B active per token for optimal efficiency
- **1M Native Context**: Process ~750k lines of Swift in a single context window
- **Hybrid Mamba-Transformer**: Purpose-built for long-context agentic workflows
- **Reasoning ON/OFF**: Configurable thinking budget with `/think` toggle
- **Best-in-class**: Top scores on SWE-Bench, GPQA Diamond, and agentic benchmarks

### Context Limits

| Backend | Limit | Notes |
|---------|-------|-------|
| Hosted API | 262K tokens | Free tier limit |
| Self-hosted NIM | 1M tokens | Full capability |
| Local Ollama | 1M tokens | Set `USE_LOCAL_LLM=true` |

---

## RAG System V2

Full implementation based on **NVIDIA RAG Blueprint (Dec 2025)**.

### RAG Pipeline Architecture

```mermaid
flowchart TB
    subgraph Ingestion["📥 Document Ingestion"]
        D[Documents<br/>.swift, .md, .txt] --> TS[SwiftTextSplitter<br/>800 chars, 120 overlap]
        TS --> CH[Chunks with Metadata]
        CH --> EMB[NVIDIA NV-EmbedQA 1B v2<br/>2048-dim vectors]
        EMB --> VS[(Vector Store<br/>.rag-store.json)]
        CH --> BM[BM25 Index<br/>Lexical tokens]
    end

    subgraph Retrieval[" Hybrid Retrieval"]
        Q[User Query] --> QE[Query Embedding]
        Q --> QT[Query Tokenization]
        QE --> VEC[Vector Search<br/>Cosine similarity]
        QT --> LEX[BM25 Search<br/>Exact matches]
        VS --> VEC
        BM --> LEX
        VEC --> RRF[Reciprocal Rank Fusion<br/>α=0.5]
        LEX --> RRF
        RRF --> TOP[Top 100 Candidates]
    end

    subgraph Reranking[" Contextual Compression"]
        TOP --> RR[NVIDIA NV-RerankQA 1B v2]
        RR --> TOPK[Top 10 Results]
    end

    subgraph Generation["💬 Response Generation"]
        TOPK --> CTX[Build Context]
        CTX --> LLM[Nemotron 3 Nano 30B<br/>1M context]
        LLM --> ANS[Answer with Citations]
    end

    style Ingestion fill:#1a1a2e
    style Retrieval fill:#16213e
    style Reranking fill:#0f3460
    style Generation fill:#e94560
```

### Query Processing Flow

```mermaid
flowchart TB
    %% ===== LEGEND =====
    subgraph Legend["🗝️ LEGEND"]
        direction LR
        L1[🟢 Input/Output]
        L2[🔵 Decomposition]
        L3[🟣 Search]
        L4[🟠 Rerank]
        L5[🟡 Decisions]
        L6[🔴 Corrections]
        L7[🟢 Generation]
    end

    %% User Input
    USER[/"👤 User Query<br/>'How do I implement OAuth in SwiftUI?'"/]
    
    %% Step 1: Query Analysis
    USER --> ANALYZE[" Analyze Query Complexity"]
    
    ANALYZE --> COMPLEX{Is it complex?<br/>Multiple topics?}
    
    %% Simple path
    COMPLEX -->|"No - Simple"| SINGLE["Single Query"]
    SINGLE --> SEARCH
    
    %% Complex path - Decomposition
    COMPLEX -->|"Yes - Complex"| DECOMPOSE["📋 Query Decomposition<br/>Break into sub-questions"]
    
    DECOMPOSE --> SUB1["Sub-query 1:<br/>'What is OAuth?'"]
    DECOMPOSE --> SUB2["Sub-query 2:<br/>'SwiftUI authentication patterns'"]
    DECOMPOSE --> SUB3["Sub-query 3:<br/>'OAuth libraries for iOS'"]
    
    SUB1 --> PARALLEL
    SUB2 --> PARALLEL
    SUB3 --> PARALLEL
    
    %% Parallel Search
    PARALLEL[" Parallel Search<br/>All queries at once"]
    PARALLEL --> SEARCH
    
    %% Hybrid Search
    SEARCH["🔎 Hybrid Search"]
    SEARCH --> BM25["BM25 Search<br/>Exact keyword matches"]
    SEARCH --> VECTOR["Vector Search<br/>Semantic similarity"]
    
    BM25 --> FUSION["🔀 RRF Fusion<br/>Combine & score results"]
    VECTOR --> FUSION
    
    %% Get candidates
    FUSION --> CANDIDATES[" 100 Candidate Chunks"]
    
    %% Rerank
    CANDIDATES --> RERANK[" NV-RerankQA<br/>Re-score by relevance"]
    RERANK --> TOP10[" Top 10 Results"]
    
    %% Reflection Check
    TOP10 --> CHECK{{"🤔 Are results relevant<br/>to original query?"}}
    
    %% Not relevant - loop back
    CHECK -->|" No - Poor results"| REWRITE["✏️ Rewrite Query<br/>Try different terms"]
    REWRITE -->|"Loop back"| SEARCH
    
    %% Relevant - continue
    CHECK -->|" Yes - Good results"| CONTEXT["📄 Build Context<br/>Format for LLM"]
    
    %% Generate
    CONTEXT --> LLM[" Nemotron 3 Nano<br/>Generate answer"]
    LLM --> GROUND{{"📏 Is answer grounded<br/>in the sources?"}}
    
    %% Not grounded - regenerate
    GROUND -->|" No - Hallucination"| REGEN[" Regenerate<br/>Stick to sources"]
    REGEN --> LLM
    
    %% Final output
    GROUND -->|" Yes - Factual"| ANSWER[/"💬 Final Answer<br/>with citations [1][2][3]"/]
    
    %% Styling
    style USER fill:#76b900,color:#000
    style ANSWER fill:#76b900,color:#000
    style DECOMPOSE fill:#0984e3
    style PARALLEL fill:#0984e3
    style SEARCH fill:#6c5ce7
    style BM25 fill:#a29bfe
    style VECTOR fill:#a29bfe
    style FUSION fill:#6c5ce7
    style RERANK fill:#e17055
    style CHECK fill:#fdcb6e,color:#000
    style GROUND fill:#fdcb6e,color:#000
    style REWRITE fill:#d63031
    style REGEN fill:#d63031
    style LLM fill:#00b894
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
| `lib/agents/rag/auto-updater.ts` | Sync high-quality flywheel records to RAG |

### Why Hybrid Retrieval?

For iOS/Swift code search:
- **BM25**: Exact matches for `viewDidLoad`, `@Observable`, `NavigationStack`
- **Vector**: Semantic matches for "how to handle state management"
- **RRF Fusion**: Combines both with weighted scores

---

## Tools (36)

### File & System (5)

| Tool | Description |
|------|-------------|
| `set_project` | Set working directory |
| `get_project` | Get current directory |
| `file_read` | Read files/directories |
| `file_write` | Write complete file content |
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

### Search (3)

| Tool | Description |
|------|-------------|
| `google_search` | Google Custom Search |
| `parallel_search` | Multiple Google searches |
| `local_docs_search` | Search local docs |

### Memory (2)

| Tool | Description |
|------|-------------|
| `memory` | Vector-based semantic memory (NVIDIA pattern) |
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

### Complete System Architecture

```mermaid
flowchart TB
    %% ===== LEGEND =====
    subgraph Legend["🗝️ LEGEND"]
        direction LR
        L1[🟢 Input/Output]
        L2[🔴 Security]
        L3[🔵 Routing]
        L4[🟢 Context Sources]
        L5[🟣 Agent Core]
        L6[🟡 Tools]
        L7[🟠 Learning]
    end

    %% ===== USER INPUT =====
    USER[/"👤 User Message<br/>'Read my AppDelegate.swift and explain what it does'"/]
    
    %% ===== SECURITY =====
    USER --> PII_CHECK["🛡️ PII Guard"]
    PII_CHECK --> PII_SCAN{{"Contains sensitive data?"}}
    
    PII_SCAN -->|"Email found"| REDACT_EMAIL["Redact → [EMAIL_REDACTED]"]
    PII_SCAN -->|"Phone found"| REDACT_PHONE["Redact → [PHONE_REDACTED]"]
    PII_SCAN -->|"API key found"| REDACT_KEY["Redact → [API_KEY_REDACTED]"]
    PII_SCAN -->|"Clean"| CLEAN["Pass through"]
    
    REDACT_EMAIL --> SANITIZED
    REDACT_PHONE --> SANITIZED
    REDACT_KEY --> SANITIZED
    CLEAN --> SANITIZED[" Sanitized Query"]
    
    %% ===== ROUTING =====
    SANITIZED --> ROUTER[" Retrieval Router<br/>Analyze query intent"]
    
    ROUTER --> ROUTE_DECISION{{"What context needed?"}}
    
    %% ===== CONTEXT PATHS =====
    ROUTE_DECISION -->|"Needs codebase knowledge"| RAG_PATH[" RAG Path"]
    ROUTE_DECISION -->|"Needs past info"| MEM_PATH[" Memory Path"]
    ROUTE_DECISION -->|"Needs current info"| SEARCH_PATH[" Search Path"]
    
    %% RAG Branch
    RAG_PATH --> RAG_SEARCH["RAG Hybrid Search<br/>BM25 + Vector"]
    RAG_SEARCH --> RAG_RERANK["NV-RerankQA<br/>Top 10 chunks"]
    RAG_RERANK --> CONTEXT
    
    %% Memory Branch
    MEM_PATH --> VMEM["Vector Memory Store<br/>Semantic search"]
    MEM_PATH --> ENT["Entity Memory<br/>People, projects"]
    VMEM --> CONTEXT
    ENT --> CONTEXT
    
    %% Search Branch
    SEARCH_PATH --> GOOGLE["Google Search<br/>parallel_search"]
    GOOGLE --> CONTEXT
    
    %% ===== UNIFIED CONTEXT =====
    CONTEXT["📋 Unified Context<br/>Aggregate all sources"]
    
    %% ===== AGENT CORE =====
    CONTEXT --> AGENT[" Agent Core"]
    AGENT --> LLM[" Nemotron 3 Nano 30B<br/>1M context window<br/>MoE: 3.5B active params"]
    
    LLM --> RESPONSE_CHECK{{"Response type?"}}
    
    %% ===== TOOL EXECUTION =====
    RESPONSE_CHECK -->|"Needs to use tools"| TOOL_CALL[" Tool Call Detected"]
    
    TOOL_CALL --> TOOL_TYPE{{"Which tool?"}}
    
    TOOL_TYPE -->|"File operations"| FS_TOOLS[" File System<br/>file_read, file_write"]
    TOOL_TYPE -->|"Run command"| SYS_TOOLS["💻 System<br/>bash"]
    TOOL_TYPE -->|"Search docs"| RAG_TOOLS[" RAG Tools<br/>rag_search, rag_query"]
    TOOL_TYPE -->|"Analyze image"| VIS_TOOLS["👁️ Vision<br/>ios_ui_review"]
    TOOL_TYPE -->|"Web search"| SRCH_TOOLS[" Search<br/>google_search"]
    TOOL_TYPE -->|"Complex task"| SPEC_TOOLS[" Specialists<br/>8 sub-agents"]
    TOOL_TYPE -->|"Remember"| MEM_TOOLS[" Memory<br/>memory, entity_memory"]
    
    FS_TOOLS --> TOOL_RESULT["📤 Tool Result"]
    SYS_TOOLS --> TOOL_RESULT
    RAG_TOOLS --> TOOL_RESULT
    VIS_TOOLS --> TOOL_RESULT
    SRCH_TOOLS --> TOOL_RESULT
    SPEC_TOOLS --> TOOL_RESULT
    MEM_TOOLS --> TOOL_RESULT
    
    TOOL_RESULT -->|"Add to messages"| LLM
    
    %% ===== FINAL RESPONSE =====
    RESPONSE_CHECK -->|"Final answer ready"| FINAL["💬 Final Response"]
    
    %% ===== LEARNING =====
    FINAL --> LOG[" Flywheel Logger<br/>Record interaction"]
    LOG --> METRICS["Calculate metrics:<br/>Tokens, latency, tool count"]
    
    %% ===== OUTPUT =====
    FINAL --> OUTPUT[/"📱 Response to User<br/>'Your AppDelegate.swift sets up...'"/]
    
    %% ===== STYLING =====
    style Legend fill:#1a1a2e,color:#fff
    style USER fill:#76b900,color:#000
    style OUTPUT fill:#76b900,color:#000
    style PII_CHECK fill:#d63031
    style PII_SCAN fill:#d63031
    style REDACT_EMAIL fill:#d63031
    style REDACT_PHONE fill:#d63031
    style REDACT_KEY fill:#d63031
    style ROUTER fill:#0984e3
    style ROUTE_DECISION fill:#0984e3
    style RAG_PATH fill:#00b894
    style MEM_PATH fill:#00b894
    style SEARCH_PATH fill:#00b894
    style CONTEXT fill:#00b894
    style AGENT fill:#6c5ce7
    style LLM fill:#6c5ce7
    style TOOL_CALL fill:#fdcb6e,color:#000
    style TOOL_TYPE fill:#fdcb6e,color:#000
    style FS_TOOLS fill:#fdcb6e,color:#000
    style SYS_TOOLS fill:#fdcb6e,color:#000
    style RAG_TOOLS fill:#fdcb6e,color:#000
    style VIS_TOOLS fill:#fdcb6e,color:#000
    style SRCH_TOOLS fill:#fdcb6e,color:#000
    style SPEC_TOOLS fill:#fdcb6e,color:#000
    style MEM_TOOLS fill:#fdcb6e,color:#000
    style LOG fill:#e17055
    style METRICS fill:#e17055
```

### Agent Tool Execution Loop

```mermaid
sequenceDiagram
    participant U as User
    participant A as Agent Core
    participant L as LLM (Nemotron)
    participant T as Tools (38)
    participant F as Flywheel

    U->>A: Query
    A->>A: PII Redaction
    A->>A: Build Context (RAG + Memory)
    
    loop Until Complete
        A->>L: Messages + Tools
        L->>A: Response + Tool Calls
        
        alt Has Tool Calls
            loop For Each Tool
                A->>T: Execute Tool
                T->>A: Result
            end
            A->>A: Add Results to Messages
        else No Tool Calls
            A->>U: Final Response
        end
    end
    
    A->>F: Log Interaction
    F->>F: Calculate Quality Signals
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

### Flywheel Architecture

```mermaid
flowchart TB
    %% ===== LEGEND =====
    subgraph Legend["🗝️ LEGEND"]
        direction LR
        L1[🟢 Production]
        L2[🔵 Logging]
        L3[🟣 Evaluation]
        L4[🟡 Dataset]
        L5[🟠 Future]
    end

    %% ===== PRODUCTION =====
    INTERACTION[/"👤 Agent Interaction<br/>'How do I fix this SwiftUI bug?'<br/>+ Response + Tool calls"/]
    
    %% ===== LOGGING =====
    INTERACTION --> LOGGER[" FlywheelLogger<br/>lib/agents/flywheel/logger.ts"]
    
    LOGGER --> RECORD["📋 Create Record"]
    
    RECORD --> REC_FIELDS["Record Fields:"]
    REC_FIELDS --> F1["⏰ Timestamp"]
    REC_FIELDS --> F2["💬 User query"]
    REC_FIELDS --> F3[" Assistant response"]
    REC_FIELDS --> F4[" Tools called + results"]
    REC_FIELDS --> F5[" Token counts"]
    REC_FIELDS --> F6[" Latency (ms)"]
    REC_FIELDS --> F7["🏷️ Session ID"]
    
    F1 --> STORE
    F2 --> STORE
    F3 --> STORE
    F4 --> STORE
    F5 --> STORE
    F6 --> STORE
    F7 --> STORE
    
    STORE[" Store Record<br/>In-memory Map"]
    
    %% ===== EVALUATION =====
    STORE --> EVAL_CHECK{{"Run evaluation?"}}
    
    EVAL_CHECK -->|"Yes"| EVALUATOR["⚖️ FlywheelEvaluator<br/>lib/agents/flywheel/evaluator.ts"]
    
    EVALUATOR --> JUDGE[" LLM-as-Judge<br/>Send to Nemotron for scoring"]
    
    JUDGE --> CRITERIA["Score on criteria:"]
    CRITERIA --> C1["Helpfulness (0-10)"]
    CRITERIA --> C2["Accuracy (0-10)"]
    CRITERIA --> C3["Completeness (0-10)"]
    CRITERIA --> C4["Clarity (0-10)"]
    CRITERIA --> C5["Overall (0-10)"]
    
    C1 --> SCORES
    C2 --> SCORES
    C3 --> SCORES
    C4 --> SCORES
    C5 --> SCORES
    
    SCORES[" Quality Scores<br/>Attached to record"]
    
    EVAL_CHECK -->|"No"| SKIP["Skip evaluation"]
    SKIP --> ACCUMULATE
    SCORES --> ACCUMULATE
    
    %% ===== DATASET CREATION =====
    ACCUMULATE[" Accumulate Records"]
    
    ACCUMULATE --> ENOUGH{{"Enough records?<br/>(min 10)"}}
    
    ENOUGH -->|"No"| WAIT["⏳ Wait for more data"]
    WAIT -->|"New interaction"| INTERACTION
    
    ENOUGH -->|"Yes"| CREATOR[" DatasetCreator<br/>lib/agents/flywheel/dataset-creator.ts"]
    
    CREATOR --> FILTER[" Filter Quality<br/>Keep rating ≥ 4"]
    
    FILTER --> VALIDATE[" Validate Records<br/>Has input + output?<br/>Response > 50 chars?<br/>Error rate < 50%?"]
    
    VALIDATE --> SPLIT["✂️ Split Dataset<br/>80% / 10% / 10%"]
    
    SPLIT --> TRAIN["📗 Training Set<br/>80% of data"]
    SPLIT --> EVAL_SET["📘 Eval Set<br/>10% of data"]
    SPLIT --> TEST["📙 Test Set<br/>10% of data"]
    
    %% ===== EXPORT =====
    TRAIN --> EXPORT["📤 Export to JSONL<br/>OpenAI fine-tuning format"]
    EVAL_SET --> EXPORT
    TEST --> EXPORT
    
    EXPORT --> JSONL["📄 dataset.jsonl<br/>{messages: [...]}"]
    
    %% ===== FUTURE USE =====
    JSONL --> FUTURE{{"Future: Fine-tune?"}}
    
    FUTURE -->|"Yes"| FINETUNE[" LoRA Fine-tuning<br/>On smaller model"]
    
    FINETUNE --> SMALLER[" Optimized Model<br/>Llama-3.2-1B<br/>98% cost reduction"]
    
    SMALLER -->|"Deploy"| DEPLOY["☁️ Deploy to Production"]
    DEPLOY -->|"Handles new queries"| INTERACTION
    
    FUTURE -->|"Not yet"| STORE_DATA[" Store for later"]
    
    %% ===== STYLING =====
    style Legend fill:#1a1a2e,color:#fff
    style INTERACTION fill:#76b900,color:#000
    style LOGGER fill:#0984e3
    style RECORD fill:#0984e3
    style STORE fill:#0984e3
    style EVALUATOR fill:#6c5ce7
    style JUDGE fill:#6c5ce7
    style SCORES fill:#6c5ce7
    style CREATOR fill:#fdcb6e,color:#000
    style FILTER fill:#fdcb6e,color:#000
    style VALIDATE fill:#fdcb6e,color:#000
    style SPLIT fill:#fdcb6e,color:#000
    style TRAIN fill:#fdcb6e,color:#000
    style EVAL_SET fill:#fdcb6e,color:#000
    style TEST fill:#fdcb6e,color:#000
    style EXPORT fill:#fdcb6e,color:#000
    style FINETUNE fill:#e17055
    style SMALLER fill:#e17055
    style DEPLOY fill:#e17055
```

### What Gets Logged

- Timestamp, session ID
- User query, agent response
- Tools called and results
- Token counts, latency
- Quality score (if evaluated)

### Quality Threshold

Only high-quality interactions are included in training datasets:

| Score | Action |
|-------|--------|
| **≥ 7/10** | Included in training dataset |
| **< 7/10** | Excluded, analyzed for failure patterns |

The `QUALITY_THRESHOLD = 7` ensures only the best interactions train future models.

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

Based on **NVIDIA RAG Blueprint multi-turn conversation pattern**.

### Vector-Based Unified Memory

All memories stored in a vector database with semantic retrieval - not keyword matching.

```mermaid
flowchart TB
    subgraph Input["📥 Memory Input"]
        USER[User tells agent something]
        AGENT[Agent learns a fact]
    end

    subgraph Storage[" Vector Memory Store"]
        USER --> EMBED["NVIDIA NV-EmbedQA 1B v2<br/>Embed content"]
        AGENT --> EMBED
        EMBED --> STORE[("~/.nvidia-cli/memory/<br/>vector-memory.json<br/>Content + Embeddings")]
    end

    subgraph Retrieval[" Semantic Retrieval"]
        QUERY[New query] --> QEMBED["Embed query"]
        QEMBED --> COSINE["Cosine similarity<br/>vs all memories"]
        STORE --> COSINE
        COSINE --> TOP["Top K relevant memories"]
    end

    style Input fill:#76b900
    style Storage fill:#1a1a2e
    style Retrieval fill:#0984e3
```

| Feature | Implementation |
|---------|----------------|
| **Storage** | Single vector store (no short/long-term distinction) |
| **Persistence** | `~/.nvidia-cli/memory/vector-memory.json` |
| **Retrieval** | Semantic search via cosine similarity |
| **Embeddings** | `nvidia/llama-3.2-nv-embedqa-1b-v2` (2048-dim) |

### Why Vector Memory?

From NVIDIA docs: *"The chain server stores the conversation history and knowledge base in a vector database and retrieves them at runtime to understand contextual queries."*

- **Semantic search**: Find "SwiftUI state management" even if you said "@Observable"
- **No data loss**: Everything persists across sessions
- **Unified**: Same retrieval pattern as RAG documents

### Memory Files

| File | Purpose |
|------|---------|
| `lib/agents/memory/vector-memory.ts` | Vector store with embeddings |
| `lib/agents/tools/unified-memory.ts` | Memory tool using vector store |
| `~/.nvidia-cli/memory/vector-memory.json` | Persisted memories |

---

## Security

### PII Guard

Automatically redacts sensitive data before processing:

| Pattern | Replacement |
|---------|-------------|
| Email addresses | `[EMAIL_REDACTED]` |
| Phone numbers | `[PHONE_REDACTED]` |
| Social Security Numbers | `[SSN_REDACTED]` |
| Credit card numbers | `[CREDIT_CARD_REDACTED]` |
| AWS access keys | `[AWS_KEY_REDACTED]` |
| AWS secret keys | `[SECRET_REDACTED]` |
| Private keys (RSA, EC, etc.) | `[PRIVATE_KEY_REDACTED]` |
| API keys (OpenAI, NVIDIA, GitHub) | `[API_KEY_REDACTED]` |

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
# Web search (Google Custom Search)
GOOGLE_API_KEY=xxx
GOOGLE_CSE_ID=xxx

# Local LLM (instead of hosted API)
USE_LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434

# Logging
LOG_LEVEL=info              # debug|info|warn|error
LOG_JSON=true               # Structured JSON output

# Tracing
TRACE_EXPORT=true           # Export spans to console
```

---

## Project Structure

```
nvidia-cli/
├── app/
│   ├── layout.tsx                  # Root layout with ErrorBoundary
│   ├── page.tsx                    # Main interface
│   ├── settings/page.tsx           # Settings
│   └── api/
│       ├── agent-chat/route.ts     # Main endpoint (36 tools)
│       ├── health/route.ts         # Health check endpoint
│       └── chat/route.ts           # Alternative endpoint
│
├── lib/
│   ├── config.ts                   # Centralized configuration
│   ├── logger.ts                   # Structured logging with levels
│   ├── context-manager.ts          # Token tracking + safety margins
│   ├── mcp-client.ts               # MCP client with retry logic
│   │
│   ├── agents/
│   │   ├── agent.ts                # Core agent loop with timeout
│   │   ├── unified-context.ts      # Context aggregation
│   │   ├── retrieval-router.ts     # Query routing with fast path
│   │   ├── feedback-optimizer.ts   # Failure analysis with Nemotron
│   │   │
│   │   ├── tools/                  # 36 tools with zod validation
│   │   │   ├── registry.ts         # Single source of truth
│   │   │   ├── file-read.ts        # With zod schema
│   │   │   ├── file-write.ts       # With zod schema
│   │   │   ├── bash.ts             # With zod schema
│   │   │   ├── google-search.ts    # With zod schema
│   │   │   └── ...
│   │   │
│   │   ├── rag/                    # RAG V2 system
│   │   │   ├── pipeline-v2.ts      # Main pipeline
│   │   │   ├── config.ts           # Profiles
│   │   │   ├── auto-updater.ts     # Flywheel → RAG sync
│   │   │   └── ...
│   │   │
│   │   ├── memory/                 # Vector memory
│   │   │   └── vector-memory.ts    # Semantic storage
│   │   │
│   │   ├── flywheel/               # Data logging
│   │   │   ├── logger.ts           # QUALITY_THRESHOLD = 7
│   │   │   ├── evaluator.ts        # LLM-as-Judge
│   │   │   └── dataset-creator.ts  # Train/eval/test splits
│   │   │
│   │   └── observability/
│   │       └── tracer.ts           # Span export (console + OTLP)
│   │
│   └── security/
│       └── pii-guard.ts            # Extended PII patterns
│
├── components/
│   ├── error-boundary.tsx          # React error boundary
│   └── ...
│
├── mcp-server.ts                   # MCP server (npx tsx)
├── start.sh                        # Dev startup script
└── .env.local                      # NVIDIA_API_KEY here
```

---

## Alignment with NVIDIA Blueprints

| NVIDIA Pattern | Dory Implementation | Status |
|----------------|---------------------|--------|
| RecursiveCharacterTextSplitter | SwiftTextSplitter |  |
| ContextualCompressionRetriever | Wide net → Rerank → Narrow |  |
| Hybrid Retrieval (BM25 + FAISS) | BM25 + Vector with RRF |  |
| NV-EmbedQA 1B v2 | Embeddings |  |
| NV-RerankQA 1B v2 | Reranking |  |
| Query Decomposition | Complex query breakdown |  |
| Self-Correction Loop | Relevance checking |  |
| Data Flywheel Logging | FlywheelLogger |  |
| LLM-as-Judge | FlywheelEvaluator |  |
| Vision Analysis | Nemotron Nano VL 12B v2 |  |
| Quality Threshold | QUALITY_THRESHOLD = 7 |  |

---

## Recent Improvements (Dec 2025)

### Reliability
- **LLM Request Timeout**: 120s AbortController prevents hanging requests
- **Token Safety Margin**: 25% buffer for code-heavy content prevents API overflow
- **MCP Connection Retry**: 3-attempt exponential backoff (1s, 2s, 4s)
- **Nudge Loop Limit**: MAX_NUDGES = 3 prevents infinite retry loops
- **Context Truncation**: Preserves first user message (original request)

### Code Quality
- **Centralized Config**: `lib/config.ts` eliminates hardcoded paths
- **Shared Tool Registry**: `lib/agents/tools/registry.ts` - single source of truth
- **Zod Validation**: Core tools validate inputs with schemas
- **Structured Logging**: `lib/logger.ts` with levels and JSON output
- **ErrorBoundary**: React error boundary wraps main app

### Security
- **Extended PII Guard**: SSN, credit cards, AWS keys, private keys
- **No Hardcoded Keys**: Google API requires environment variables

### Data Quality
- **Quality Threshold**: Only interactions scoring ≥ 7/10 enter training datasets
- **FeedbackOptimizer**: Analyzes failures with Nemotron, suggests fixes
- **AutoRAGUpdater**: Deduplicates before ingesting to RAG

### Cleanup
- **Removed**: ToolGuard (unnecessary for private use)
- **Removed**: RAG V1 pipeline (V2 is now the only implementation)
- **Removed**: Prisma (unused database layer)
- **Removed**: tavily-search.ts (dead code)
- **Standardized**: All scripts use `tsx` instead of `ts-node`

---

## MCP Integration (Model Context Protocol)

### What is MCP?

MCP (Model Context Protocol) is an open standard by Anthropic that lets AI tools communicate with any AI client. Think of it like USB for AI tools - one standard interface that works everywhere.

**Before MCP:** Each AI client (Codex CLI, web app, etc.) needed custom tool implementations.

**After MCP:** One MCP server exposes all tools, any client can use them.

### Architecture

```mermaid
flowchart TB
    subgraph Clients["🖥️ AI Clients"]
        CODEX["Codex CLI<br/>(OpenAI)"]
        KIRO["Kiro CLI<br/>(AWS Dory Agent)"]
        DORY["Dory Web App<br/>(This project)"]
        FUTURE["Future Clients<br/>(Claude, etc.)"]
    end

    subgraph MCP["🔌 MCP Protocol"]
        SERVER["mcp-server.ts<br/>35 Tools Exposed"]
    end

    subgraph Tools[" Tool Implementations"]
        BASH["bash"]
        FILE["file_read/write"]
        RAG["rag_* (8 tools)"]
        SEARCH["google_search"]
        MEMORY["memory"]
        FLYWHEEL["flywheel_*"]
        MORE["...30 more"]
    end

    CODEX -->|"stdio/JSON-RPC"| SERVER
    KIRO -->|"stdio/JSON-RPC"| SERVER
    DORY -->|"stdio/JSON-RPC"| SERVER
    FUTURE -->|"stdio/JSON-RPC"| SERVER

    SERVER --> BASH
    SERVER --> FILE
    SERVER --> RAG
    SERVER --> SEARCH
    SERVER --> MEMORY
    SERVER --> FLYWHEEL
    SERVER --> MORE

    style Clients fill:#76b900
    style MCP fill:#0984e3
    style Tools fill:#fdcb6e,color:#000
```

### How It Works

1. **MCP Server** (`mcp-server.ts`) exposes all 36 tools via JSON-RPC over stdio
2. **Clients** connect to the server and discover available tools via `listTools()`
3. **Tool calls** happen via `callTool(name, args)` - same interface for all clients
4. **Results** return as structured JSON

### Files

| File | Purpose |
|------|---------|
| `mcp-server.ts` | MCP server exposing 36 tools (runs with `npx tsx`) |
| `lib/mcp-client.ts` | MCP client for web app (spawns server, caches tools) |
| `lib/agents/mcp-agent.ts` | Agent that uses MCP for tool discovery/execution |
| `app/api/mcp-chat/route.ts` | API endpoint using MCP agent |

### Codex CLI Configuration

Add to `~/.codex/config.toml`:

```toml
# Use NVIDIA NIM as the model provider
model = "nvidia/nemotron-3-nano-30b-a3b"
model_provider = "nvidia-nim"

[model_providers.nvidia-nim]
name = "NVIDIA NIM"
base_url = "https://integrate.api.nvidia.com/v1"
env_key = "NGC_API_KEY"
wire_api = "chat"

# Connect to nvidia-cli MCP server
[mcp_servers.nvidia-cli]
command = "npx"
args = ["tsx", "/Users/home/Documents/nvidia-cli/mcp-server.ts"]
cwd = "/Users/home/Documents/nvidia-cli"
startup_timeout_sec = 120
tool_timeout_sec = 120
env = { NGC_API_KEY = "${NGC_API_KEY}", NVIDIA_API_KEY = "${NGC_API_KEY}", GOOGLE_API_KEY = "${GOOGLE_API_KEY}", GOOGLE_CSE_ID = "${GOOGLE_CSE_ID}" }
```

### Environment Variables

Make sure these are set in your shell (add to `~/.zshrc`):

```bash
# NVIDIA API Key (get from build.nvidia.com)
export NGC_API_KEY="nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Google Custom Search (optional, for web search)
export GOOGLE_API_KEY="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export GOOGLE_CSE_ID="xxxxxxxxxxxxxxxxx"
```

### Testing MCP Server

```bash
# Start server manually (should print "[nvidia-cli MCP] Server started")
cd /Users/home/Documents/nvidia-cli
npx tsx mcp-server.ts

# In Codex CLI, check tools are available
/mcp
# Should show nvidia-cli with 36 tools
```

### Why MCP Matters

| Problem | MCP Solution |
|---------|--------------|
| Duplicate tool code in each client | One implementation, many clients |
| Inconsistent behavior | Same tools = same behavior everywhere |
| Hard to add new tools | Add once to server, all clients get it |
| Complex orchestration | Client handles orchestration, server just executes |

### MCP vs Direct Tool Calls

**Direct (old way):**
```typescript
// Web app had to instantiate and manage each tool
const bashTool = new BashTool();
const result = await bashTool.execute({ command: "ls" });
```


---

## Kiro CLI Integration (AWS Kiro + Dory Agent)

### What is Kiro CLI?

**Kiro CLI** is AWS's AI-powered coding assistant that supports MCP servers and custom agents. The **Dory agent** configuration connects Kiro to nvidia-cli's 36 tools plus Context7 for live documentation lookup.

### Architecture

```mermaid
flowchart TB
    subgraph Kiro["🖥️ Kiro CLI (AWS)"]
        AGENT[Dory Agent<br/>~/.kiro/agents/dory.json]
        HOOKS[Hooks System<br/>agentSpawn, postToolUse, stop]
        MEMORY_FILE[User Memory<br/>~/.kiro/user-memory.md]
    end

    subgraph MCP_Servers["🔌 MCP Servers"]
        NVIDIA[nvidia-cli<br/>36 Tools]
        CTX7[Context7<br/>Live Docs Lookup]
    end

    subgraph Tools["🛠️ Available Tools"]
        FILE[file_read/write]
        BASH[bash]
        RAG[rag_* (8 tools)]
        SEARCH[google_search]
        MEM[memory, entity_memory]
        FLY[flywheel_*]
        RESOLVE[resolve-library-id]
        GETDOCS[get-library-docs]
    end

    AGENT -->|"spawns"| NVIDIA
    AGENT -->|"spawns"| CTX7
    HOOKS -->|"agentSpawn"| MEMORY_FILE
    HOOKS -->|"postToolUse"| MEMORY_FILE
    
    NVIDIA --> FILE
    NVIDIA --> BASH
    NVIDIA --> RAG
    NVIDIA --> SEARCH
    NVIDIA --> MEM
    NVIDIA --> FLY
    
    CTX7 --> RESOLVE
    CTX7 --> GETDOCS

    style Kiro fill:#FF9900
    style MCP_Servers fill:#0984e3
    style Tools fill:#fdcb6e,color:#000
```

### Dory Agent Configuration

The Dory agent is configured at `~/.kiro/agents/dory.json`:

```json
{
  "name": "dory",
  "description": "NVIDIA-only agent - uses nvidia-cli and context7 MCP tools only",
  "mcpServers": {
    "nvidia-cli": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["tsx", "/Users/home/Documents/nvidia-cli/mcp-server.ts"],
      "cwd": "/Users/home/Documents/nvidia-cli",
      "env": {
        "NVIDIA_API_KEY": "${NVIDIA_API_KEY}",
        "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
        "GOOGLE_CSE_ID": "${GOOGLE_CSE_ID}"
      },
      "timeout": 120000
    },
    "context7": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "@upstash/context7-mcp", "--transport", "stdio", "--api-key", "${CONTEXT7_API_KEY}"],
      "timeout": 120000
    }
  },
  "tools": ["@nvidia-cli", "@context7"],
  "hooks": {
    "agentSpawn": [
      { "command": "echo '=== USER MEMORY LOADED ===' && cat ~/.kiro/user-memory.md" }
    ],
    "postToolUse": [
      {
        "matcher": "@nvidia-cli/memory",
        "command": "if echo \"$tool_input\" | grep -q '\"operation\":\"remember\"'; then echo \"$(date): $(echo \"$tool_input\" | jq -r '.content')\" >> ~/.kiro/user-memory.md; fi"
      }
    ]
  },
  "model": "claude-opus-4.5"
}
```

### Hooks System

The Dory agent uses hooks to inject context and persist memory:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `agentSpawn` | Agent starts | Loads `~/.kiro/user-memory.md` into context |
| `postToolUse` | After `@nvidia-cli/memory` with `remember` | Auto-appends to user-memory.md |
| `stop` | Conversation ends | Logs completion for flywheel |

### User Memory File

The `~/.kiro/user-memory.md` file persists user preferences across sessions:

```markdown
# User Preferences & Memory

## Development Preferences
- **Favorite code/framework**: SwiftUI
- **Development approach**: Full implementation with ALL features
- **Quality standards**: Production-ready with Apple documentation compliance

## Project Context
- **Current project**: iOS SpaceX App (3-2-1-Liftoff)
- **Project path**: /Users/home/Documents/iOS/3-2-1-Liftoff

## Instructions for AI Assistant
- Always reference these preferences when answering questions
- Maintain production-ready code standards
- Follow Apple's official documentation guidelines
```

### Quick Start with Kiro CLI

```bash
# Start Kiro CLI with Dory agent
q  # alias for: kiro-cli chat --agent dory

# Or explicitly
kiro-cli chat --agent dory

# Stop all servers
qquit  # alias to stop MCP servers

# View live logs
qlog  # alias to tail server logs
```

### Shell Aliases for Kiro

Add to `~/.zshrc`:

```bash
# Start Kiro with Dory agent
alias q="kiro-cli chat --agent dory"

# Stop all Dory servers
alias qquit="pkill -f 'mcp-server' ; pkill -f 'context7-mcp' ; echo '🛑 Dory servers stopped.'"

# View live logs
alias qlog="tail -f ~/.kiro/logs/*.log 2>/dev/null || echo 'No logs found'"
```

### Context7 Integration

Context7 provides live documentation lookup for any library:

```bash
# In Kiro chat, ask about any library
"How do I use SwiftUI NavigationStack?"

# Dory will:
# 1. Call resolve-library-id to find SwiftUI docs
# 2. Call get-library-docs to fetch current documentation
# 3. Answer with up-to-date code examples
```

### Why Kiro + Dory?

| Feature | Benefit |
|---------|---------|
| **Claude Opus 4.5** | Most capable model for complex coding tasks |
| **36 nvidia-cli tools** | Full file, RAG, search, memory capabilities |
| **Context7 docs** | Always up-to-date library documentation |
| **Persistent memory** | Remembers preferences across sessions |
| **Hooks system** | Auto-injects context, auto-saves memories |

**MCP (new way):**
```typescript
// Web app just calls MCP
const result = await callMCPTool("bash", { command: "ls" });
// MCP server handles instantiation, execution, everything
```

---

## API Keys Reference

### NVIDIA API Key

**Where to get:** [build.nvidia.com](https://build.nvidia.com)

**What it powers:**
- Nemotron 3 Nano 30B (main LLM)
- NV-EmbedQA 1B v2 (embeddings)
- NV-RerankQA 1B v2 (reranking)
- Nemotron Nano VL 12B v2 (vision)

**Environment variable:** `NVIDIA_API_KEY` or `NGC_API_KEY` (both work)

**Format:** `nvapi-` followed by ~50 characters

### Google Custom Search

**Where to get:**
1. [Google Cloud Console](https://console.cloud.google.com) → Create project → Enable "Custom Search API"
2. [Programmable Search Engine](https://programmablesearchengine.google.com) → Create search engine → Get CSE ID

**What it powers:**
- `google_search` tool
- `parallel_search` tool

**Environment variables:**
- `GOOGLE_API_KEY` - API key from Cloud Console
- `GOOGLE_CSE_ID` - Search engine ID from Programmable Search

---

## Troubleshooting

### MCP Server Won't Start

```bash
# Check if tsx is installed
npx tsx --version

# Check for syntax errors
cd /Users/home/Documents/nvidia-cli
npx tsx mcp-server.ts
# Should print "[nvidia-cli MCP] Server started"
```

### "Transport closed" Error in Codex

This means the MCP server crashed. Common causes:

1. **Missing API key** - Check `NGC_API_KEY` is set
2. **Tool constructor error** - Some tools need `apiKey` parameter
3. **Timeout** - Increase `tool_timeout_sec` in config

### RAG Not Finding Documents

```bash
# Check RAG stats
# In Dory chat: "use rag_stats"

# Re-ingest documents
# In Dory chat: "use rag_ingest for /path/to/project"
```

### Build Errors (Next.js)

```bash
# mcp-server.ts uses .ts imports which Next.js doesn't like
# It's excluded in tsconfig.json - if you see errors, check:
cat tsconfig.json | grep exclude
# Should include "mcp-server.ts"
```

---

## Development Notes

### Adding a New Tool

1. Create tool class in `lib/agents/tools/your-tool.ts`
2. Export from `lib/agents/index.ts`
3. Register in `mcp-server.ts`:

```typescript
// Import
import { YourTool } from "./lib/agents/tools/your-tool.ts";

// Instantiate
const yourTool = new YourTool();

// Register with MCP
server.tool(
  "your_tool",
  "Description of what it does",
  { param1: z.string().describe("What param1 is") },
  async ({ param1 }) => {
    const result = await yourTool.execute({ param1 });
    return { content: [{ type: "text", text: result }] };
  }
);
```

4. Rebuild and test:
```bash
npm run build
npx tsx mcp-server.ts  # Should start without errors
```

### Local LLM Setup (Ollama)

For unlimited context and no API costs:

```bash
# Install Ollama
brew install ollama

# Pull a model
ollama pull llama3.2

# Set environment
export USE_LOCAL_LLM=true
export OLLAMA_BASE_URL=http://localhost:11434/v1
```

---

## License

Private use only.


---

##  Production Data Flywheel (Dec 2025)

### Plain-English Overview

The Data Flywheel is a **self-healing, fully-observable notebook** that:

1. **Automatically retries** any failed operation (network glitches don't break the flow)
2. **Logs every step** with a unique tag (full traceability across services)
3. **Scores each entry** for quality (good vs. bad)
4. **Files entries** into the appropriate training bucket (SFT or DPO)
5. **Visualizes** daily totals, reward balance, and failure rate on a live dashboard
6. **Alerts you** when the failure rate spikes above 5%

All without requiring any new permissions beyond what your existing setup grants.

### What Each Piece Does (Plain English)

| Piece | Everyday Analogy | What It Actually Does |
|-------|------------------|----------------------|
| **Elasticsearch Sink** | Notebook keeper that writes every event | Stores records to ES with retry logic (exponential backoff, up to 5 attempts) and a dead-letter folder for permanently failed writes |
| **Retry Mixin** | Safety net that catches falling tools | Wraps any async function with automatic retries on 429/5xx errors using exponential backoff with jitter |
| **Quality Scorer** | Quality inspector sorting papers | Reads structural + functional scores, decides "good" (reward=1) or "bad" (reward=0) |
| **Quality Filter** | Bucket router | Drops entries into `sft_traces/` (good) or `dpo_traces/` (needs work) |
| **Query Rewriter** | Spell-check for bad queries | Calls external LLM rewriter, gets new query, retries retrieval |
| **Request-ID Logger** | Unique name-tag on every page | Every log line carries a unique `requestId` for full traceability |
| **Live Dashboard** | Control-room screen | Shows daily volume, reward distribution, and error-rate gauge (refreshes every 30s) |
| **Error Monitor** | Alarm that rings when something goes wrong | Every 5min computes error_rate; if >5% logs warning and optionally posts to Slack |

### Production Files

| File | Purpose |
|------|---------|
| `lib/agents/retry-mixin.ts` | NAT-style `withRetry()` wrapper for all async calls |
| `lib/agents/tracing.ts` | Request ID correlation + structured logging |
| `lib/agents/flywheel/types.ts` | DFWESRecord + DLQRecord schemas |
| `lib/agents/flywheel/logger.ts` | Central flywheel logger |
| `lib/agents/flywheel/elasticsearch-sink.ts` | ES ingest with retry + DLQ |
| `lib/agents/flywheel/trajectory-scorer.ts` | Binary reward scoring |
| `lib/agents/flywheel/quality-filter.ts` | Route to sft_traces/ or dpo_traces/ |
| `lib/agents/flywheel/error-monitor.ts` | 5-min error rate checker with alerts |
| `lib/agents/rag/query-rewriter.ts` | Self-corrective RAG loop |
| `app/api/dashboard/route.ts` | Metrics API endpoint |
| `app/api/webhook/route.ts` | Error alert webhook receiver |
| `app/dashboard/page.tsx` | Live dashboard UI with charts |
| `nat/configs/dory_workflow.yml` | Production NAT config |

### Directories

| Directory | Purpose |
|-----------|---------|
| `sft_traces/` | High-quality traces (reward=1) for SFT training |
| `dpo_traces/` | Low-quality traces (reward=0) for DPO training |
| `dlq/` | Dead-letter queue for failed ES writes |

### Quick Start Commands

```bash
# Start everything (ES, MCP, Terminal, Next.js)
nv

# Stop everything
nvquit

# View dashboard
open http://localhost:3000/dashboard

# Check metrics API
curl http://localhost:3000/api/dashboard

# Check ES health
curl http://localhost:9200/_cluster/health?pretty

# View traces in ES
curl "http://localhost:9200/nvidia-cli-traces/_search?pretty&size=5"
```

### Configuration (nat/configs/dory_workflow.yml)

```yaml
general:
  max_iterations: 2000    # Higher for complex flows
  timeout: 86400          # 24h for batch jobs

llms:
  nim_nemotron:
    do_auto_retry: true
    num_retries: 7
    retry_on_status_codes: ["429", "5xx"]
    retry_on_errors: ["network error", "timeout"]

telemetry_exporters:
  flywheel:
    _type: data_flywheel
    endpoint: ${ELASTICSEARCH_ENDPOINT}
    index: nvidia-cli-traces
    client_id: nvidia-cli
```

### How the Pieces Connect

```
User Action → MCP Tool Call → Retry Mixin (auto-retry on failure)
                                    ↓
                            IngestEngine creates FlywheelRecord
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            ES accepts it                    ES rejects it
                    ↓                               ↓
        Stored in nvidia-cli-traces         Written to dlq/
                    ↓
            Quality Scorer evaluates
                    ↓
            ┌───────┴───────┐
            ↓               ↓
        reward=1        reward=0
            ↓               ↓
      sft_traces/     dpo_traces/
                    ↓
            Dashboard shows metrics
                    ↓
        Error Monitor checks every 5min
                    ↓
            If >5% errors → Alert
```

### Extending the System

| Extension | How To |
|-----------|--------|
| **Add Slack alerts** | Set `SLACK_WEBHOOK_URL` in `.env.local` |
| **Change error threshold** | Edit `THRESHOLD` in `error-monitor.ts` |
| **Export training data** | Zip `sft_traces/` and `dpo_traces/` |
| **Add more metrics** | Edit `app/api/dashboard/route.ts` |

### Verified Against NVIDIA Docs

All implementations verified against official NVIDIA NeMo Agent Toolkit 1.3 documentation:

| Component | NVIDIA Reference | Status |
|-----------|------------------|--------|
| DFWESRecord schema | `nat.plugins.data_flywheel.observability.schema.sink.elasticsearch` |  |
| RetryMixin fields | `nat.data_models.retry_mixin` |  |
| Wildcard status codes | `retry_on_status_codes: ["429", "5xx"]` |  |
| Contract version | `"1.1"` |  |

---

## Shell Aliases

Add to `~/.zshrc` for quick access:

```bash
# === Kiro CLI + Dory Agent ===
# Start Kiro with Dory agent (nvidia-cli + context7 MCP servers)
alias q="kiro-cli chat --agent dory"

# Stop all Dory MCP servers
alias qquit="pkill -f 'mcp-server' ; pkill -f 'context7-mcp' ; echo '🛑 Dory servers stopped.'"

# View live server logs
alias qlog="tail -f ~/.kiro/logs/*.log 2>/dev/null || echo 'No logs found'"

# === Web UI + Elasticsearch ===
# Start all services (ES, MCP, Terminal, Next.js)
alias nv="/Users/home/Documents/nvidia-cli/start.sh"
alias codex="/Users/home/Documents/nvidia-cli/start.sh"

# Stop all services
alias nvquit="pkill -f 'next dev' ; pkill -f 'terminal-server' ; pkill -f 'mcp-server' ; pkill -f 'node.*nvidia-cli' ; kill \$(cat ~/Downloads/elasticsearch-8.11.0/es.pid 2>/dev/null) 2>/dev/null ; echo '🛑 Dory + ES shutdown complete.'"
```

After adding, run `source ~/.zshrc` or open a new terminal.

### What `q` Starts (Kiro CLI)

1. **nvidia-cli MCP Server** - 36 tools for file ops, RAG, search, memory
2. **Context7 MCP Server** - Live documentation lookup
3. **Loads user-memory.md** - Via agentSpawn hook
4. **Claude Opus 4.5** - As the reasoning model

### What `nv` Starts (Web UI)

1. **Elasticsearch** (if not running) - Data storage
2. **MCP Server** - Tool execution
3. **Terminal Server** - Terminal UI
4. **Next.js** - Web UI at localhost:3000
5. **Opens browser** to localhost:3000

### What `qquit` / `nvquit` Stops

- All MCP server processes
- Elasticsearch (via PID file for nvquit)
- Clean shutdown with confirmation message

---
