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
  <a href="#tools-38">Tools</a> •
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

```mermaid
flowchart LR
    subgraph API["NVIDIA NIM API"]
        KEY[NVIDIA_API_KEY]
    end

    subgraph Models["Model Stack"]
        KEY --> LLM["🧠 Nemotron 3 Nano 30B<br/>Main LLM<br/>1M context, MoE"]
        KEY --> EMB["📊 NV-EmbedQA 1B v2<br/>Embeddings<br/>2048 dimensions"]
        KEY --> RR["⚡ NV-RerankQA 1B v2<br/>Reranker<br/>Score refinement"]
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

    subgraph Retrieval["🔍 Hybrid Retrieval"]
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

    subgraph Reranking["⚡ Contextual Compression"]
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
    %% User Input
    USER[/"👤 User Query<br/>'How do I implement OAuth in SwiftUI?'"/]
    
    %% Step 1: Query Analysis
    USER --> ANALYZE["🔍 Analyze Query Complexity"]
    
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
    PARALLEL["⚡ Parallel Search<br/>All queries at once"]
    PARALLEL --> SEARCH
    
    %% Hybrid Search
    SEARCH["🔎 Hybrid Search"]
    SEARCH --> BM25["BM25 Search<br/>Exact keyword matches"]
    SEARCH --> VECTOR["Vector Search<br/>Semantic similarity"]
    
    BM25 --> FUSION["🔀 RRF Fusion<br/>Combine & score results"]
    VECTOR --> FUSION
    
    %% Get candidates
    FUSION --> CANDIDATES["📚 100 Candidate Chunks"]
    
    %% Rerank
    CANDIDATES --> RERANK["⚡ NV-RerankQA<br/>Re-score by relevance"]
    RERANK --> TOP10["🎯 Top 10 Results"]
    
    %% Reflection Check
    TOP10 --> CHECK{{"🤔 Are results relevant<br/>to original query?"}}
    
    %% Not relevant - loop back
    CHECK -->|"❌ No - Poor results"| REWRITE["✏️ Rewrite Query<br/>Try different terms"]
    REWRITE -->|"Loop back"| SEARCH
    
    %% Relevant - continue
    CHECK -->|"✅ Yes - Good results"| CONTEXT["📄 Build Context<br/>Format for LLM"]
    
    %% Generate
    CONTEXT --> LLM["🧠 Nemotron 3 Nano<br/>Generate answer"]
    LLM --> GROUND{{"📏 Is answer grounded<br/>in the sources?"}}
    
    %% Not grounded - regenerate
    GROUND -->|"❌ No - Hallucination"| REGEN["🔄 Regenerate<br/>Stick to sources"]
    REGEN --> LLM
    
    %% Final output
    GROUND -->|"✅ Yes - Factual"| ANSWER[/"💬 Final Answer<br/>with citations [1][2][3]"/]
    
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

### Why Hybrid Retrieval?

For iOS/Swift code search:
- **BM25**: Exact matches for `viewDidLoad`, `@Observable`, `NavigationStack`
- **Vector**: Semantic matches for "how to handle state management"
- **RRF Fusion**: Combines both with weighted scores

---

## Tools (38)

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

### Search (3)

| Tool | Description |
|------|-------------|
| `google_search` | Google Custom Search |
| `parallel_search` | Multiple Google searches |
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

### Complete System Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client"]
        UI[Web UI<br/>localhost:3000]
    end

    subgraph Security["🛡️ Security Layer"]
        PII[PII Guard<br/>Redacts emails, phones, API keys, IPs]
    end

    subgraph Intelligence["🧠 Intelligence Layer"]
        RR[Retrieval Router]
        RR --> RAG_PATH[RAG Path]
        RR --> MEM_PATH[Memory Path]
        RR --> SEARCH_PATH[Search Path]
    end

    subgraph Context["📚 Unified Context"]
        RAG_PATH --> RAG[RAG Pipeline V2<br/>Hybrid BM25+Vector]
        MEM_PATH --> STM[Short-term Memory<br/>Session]
        MEM_PATH --> LTM[Long-term Memory<br/>~/.nvidia-cli/memory.json]
        MEM_PATH --> ENT[Entity Memory<br/>People, Projects]
        SEARCH_PATH --> WEB[Web Search<br/>Google]
        
        RAG --> UC[Context Aggregator]
        STM --> UC
        LTM --> UC
        ENT --> UC
        WEB --> UC
    end

    subgraph Agent["🤖 Agent Core"]
        UC --> LLM[Nemotron 3 Nano 30B<br/>1M context, MoE]
        LLM --> TOOLS[38 Tools]
        TOOLS --> |Results| LLM
        LLM --> |More tools needed| TOOLS
    end

    subgraph ToolCategories["🛠️ Tool Categories"]
        TOOLS --> FS[File System<br/>read, write]
        TOOLS --> SYS[System<br/>bash]
        TOOLS --> RAGT[RAG Tools<br/>8 tools]
        TOOLS --> VIS[Vision<br/>3 tools]
        TOOLS --> SRCH[Search<br/>3 tools]
        TOOLS --> SPEC[Specialists<br/>8 sub-agents]
    end

    subgraph Learning["📊 Data Flywheel"]
        LLM --> LOG[Flywheel Logger]
        LOG --> DS[Dataset Creator<br/>Train/Eval/Test]
        LOG --> EVAL[LLM-as-Judge<br/>Quality Scoring]
    end

    UI --> PII
    PII --> RR
    LLM --> |Response| UI

    style Client fill:#2d3436
    style Security fill:#d63031
    style Intelligence fill:#0984e3
    style Context fill:#00b894
    style Agent fill:#6c5ce7
    style ToolCategories fill:#fdcb6e
    style Learning fill:#e17055
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
flowchart LR
    subgraph Production["🚀 Production"]
        INT[Agent Interactions]
    end

    subgraph Logging["📝 Logging"]
        INT --> LOG[FlywheelLogger]
        LOG --> REC[Records:<br/>Query, Response, Tools,<br/>Tokens, Latency]
    end

    subgraph Evaluation["⚖️ Evaluation"]
        REC --> JUDGE[LLM-as-Judge<br/>FlywheelEvaluator]
        JUDGE --> SCORES[Quality Scores:<br/>Helpfulness, Accuracy,<br/>Completeness 0-10]
    end

    subgraph Dataset["📊 Dataset Creation"]
        SCORES --> FILTER[Filter High Quality<br/>Rating ≥ 4]
        FILTER --> SPLIT[DatasetCreator<br/>80/10/10 Split]
        SPLIT --> TRAIN[Training Set]
        SPLIT --> EVAL_SET[Eval Set]
        SPLIT --> TEST[Test Set]
    end

    subgraph Future["🔮 Future Use"]
        TRAIN --> FINETUNE[LoRA Fine-tuning]
        FINETUNE --> SMALLER[Smaller Model<br/>Lower Cost]
        SMALLER --> |Deploy| Production
    end

    style Production fill:#00b894
    style Logging fill:#0984e3
    style Evaluation fill:#6c5ce7
    style Dataset fill:#fdcb6e
    style Future fill:#e17055
```

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
# Web search (Google Custom Search)
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
│       ├── agent-chat/route.ts     # Main endpoint (38 tools)
│       └── chat/route.ts           # Alternative endpoint
│
├── lib/
│   ├── agents/
│   │   ├── agent.ts                # Core agent loop
│   │   ├── unified-context.ts      # Context aggregation
│   │   ├── retrieval-router.ts     # Query routing
│   │   │
│   │   ├── tools/                  # 38 tools
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
