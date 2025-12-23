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
| Session memory | Forgets between chats | Vector memory with semantic retrieval |
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
    CLEAN --> SANITIZED["✅ Sanitized Query"]
    
    %% ===== ROUTING =====
    SANITIZED --> ROUTER["🧠 Retrieval Router<br/>Analyze query intent"]
    
    ROUTER --> ROUTE_DECISION{{"What context needed?"}}
    
    %% ===== CONTEXT PATHS =====
    ROUTE_DECISION -->|"Needs codebase knowledge"| RAG_PATH["📚 RAG Path"]
    ROUTE_DECISION -->|"Needs past info"| MEM_PATH["🧠 Memory Path"]
    ROUTE_DECISION -->|"Needs current info"| SEARCH_PATH["🌐 Search Path"]
    
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
    CONTEXT --> AGENT["🤖 Agent Core"]
    AGENT --> LLM["🧠 Nemotron 3 Nano 30B<br/>1M context window<br/>MoE: 3.6B active params"]
    
    LLM --> RESPONSE_CHECK{{"Response type?"}}
    
    %% ===== TOOL EXECUTION =====
    RESPONSE_CHECK -->|"Needs to use tools"| TOOL_CALL["🛠️ Tool Call Detected"]
    
    TOOL_CALL --> TOOL_TYPE{{"Which tool?"}}
    
    TOOL_TYPE -->|"File operations"| FS_TOOLS["📁 File System<br/>file_read, file_write"]
    TOOL_TYPE -->|"Run command"| SYS_TOOLS["💻 System<br/>bash"]
    TOOL_TYPE -->|"Search docs"| RAG_TOOLS["📚 RAG Tools<br/>rag_search, rag_query"]
    TOOL_TYPE -->|"Analyze image"| VIS_TOOLS["👁️ Vision<br/>ios_ui_review"]
    TOOL_TYPE -->|"Web search"| SRCH_TOOLS["🌐 Search<br/>google_search"]
    TOOL_TYPE -->|"Complex task"| SPEC_TOOLS["🎯 Specialists<br/>8 sub-agents"]
    TOOL_TYPE -->|"Remember"| MEM_TOOLS["🧠 Memory<br/>memory, entity_memory"]
    
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
    FINAL --> LOG["📊 Flywheel Logger<br/>Record interaction"]
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
    INTERACTION --> LOGGER["📝 FlywheelLogger<br/>lib/agents/flywheel/logger.ts"]
    
    LOGGER --> RECORD["📋 Create Record"]
    
    RECORD --> REC_FIELDS["Record Fields:"]
    REC_FIELDS --> F1["⏰ Timestamp"]
    REC_FIELDS --> F2["💬 User query"]
    REC_FIELDS --> F3["🤖 Assistant response"]
    REC_FIELDS --> F4["🛠️ Tools called + results"]
    REC_FIELDS --> F5["📊 Token counts"]
    REC_FIELDS --> F6["⚡ Latency (ms)"]
    REC_FIELDS --> F7["🏷️ Session ID"]
    
    F1 --> STORE
    F2 --> STORE
    F3 --> STORE
    F4 --> STORE
    F5 --> STORE
    F6 --> STORE
    F7 --> STORE
    
    STORE["💾 Store Record<br/>In-memory Map"]
    
    %% ===== EVALUATION =====
    STORE --> EVAL_CHECK{{"Run evaluation?"}}
    
    EVAL_CHECK -->|"Yes"| EVALUATOR["⚖️ FlywheelEvaluator<br/>lib/agents/flywheel/evaluator.ts"]
    
    EVALUATOR --> JUDGE["🧠 LLM-as-Judge<br/>Send to Nemotron for scoring"]
    
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
    
    SCORES["📊 Quality Scores<br/>Attached to record"]
    
    EVAL_CHECK -->|"No"| SKIP["Skip evaluation"]
    SKIP --> ACCUMULATE
    SCORES --> ACCUMULATE
    
    %% ===== DATASET CREATION =====
    ACCUMULATE["📚 Accumulate Records"]
    
    ACCUMULATE --> ENOUGH{{"Enough records?<br/>(min 10)"}}
    
    ENOUGH -->|"No"| WAIT["⏳ Wait for more data"]
    WAIT -->|"New interaction"| INTERACTION
    
    ENOUGH -->|"Yes"| CREATOR["📊 DatasetCreator<br/>lib/agents/flywheel/dataset-creator.ts"]
    
    CREATOR --> FILTER["🔍 Filter Quality<br/>Keep rating ≥ 4"]
    
    FILTER --> VALIDATE["✅ Validate Records<br/>Has input + output?<br/>Response > 50 chars?<br/>Error rate < 50%?"]
    
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
    
    FUTURE -->|"Yes"| FINETUNE["🔧 LoRA Fine-tuning<br/>On smaller model"]
    
    FINETUNE --> SMALLER["🚀 Optimized Model<br/>Llama-3.2-1B<br/>98% cost reduction"]
    
    SMALLER -->|"Deploy"| DEPLOY["☁️ Deploy to Production"]
    DEPLOY -->|"Handles new queries"| INTERACTION
    
    FUTURE -->|"Not yet"| STORE_DATA["💾 Store for later"]
    
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

    subgraph Storage["💾 Vector Memory Store"]
        USER --> EMBED["NVIDIA NV-EmbedQA 1B v2<br/>Embed content"]
        AGENT --> EMBED
        EMBED --> STORE[("~/.nvidia-cli/memory/<br/>vector-memory.json<br/>Content + Embeddings")]
    end

    subgraph Retrieval["🔍 Semantic Retrieval"]
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
