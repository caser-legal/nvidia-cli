# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dory — a private, single-user enterprise iOS/SwiftUI coding agent built on NVIDIA Nemotron 3 Nano (1M context) with a hybrid RAG pipeline for indexing entire Xcode projects. See `.project-context` for the product-level overview (target: 100k+ line iOS projects, 500+ Swift files, holistic reasoning across modules instead of file-by-file).

The repo is a Next.js app that wraps several long-running side processes (MCP server, terminal server, flywheel API, optional Python NAT runtime, optional Elasticsearch).

## Common commands

```bash
# Install
npm install

# Web app only (Next.js on :3000)
npm run dev

# Web app + xterm/node-pty terminal websocket server
npm run dev:all                # runs `next dev` and `lib/terminal-server.ts` concurrently

# Lint
npm run lint                   # next lint
npm run lint:sections          # ./scripts/lint-sections.sh (project-specific section linter)

# Production build
npm run build && npm start

# Full local stack (Elasticsearch + MCP + terminal + flywheel + Next.js)
./start.sh                     # writes logs to /tmp/nvidia-cli-*.log; opens browser
# Stop with: nvquit  (referenced in start.sh; not defined in this repo)

# Run individual side processes manually (each is a `tsx` entry point)
npx tsx mcp-server.ts          # MCP stdio server exposing all dory tools
npx tsx mcp-server-minimal.ts  # subset of mcp-server.ts (smaller tool set)
npx tsx flywheel-api.ts        # Express server on :3001 for external clients (e.g. Kiro CLI)
npx tsx lib/terminal-server.ts # node-pty WebSocket bridge for the in-app terminal

# CLI client (talks to /api/agent-chat over SSE)
node bin/dory "<message>" [--mode <chat|coder|research|...>]
# Env: DORY_API_URL (default http://localhost:3000/api/agent-chat), NVIDIA_API_KEY

# Memory migration (one-shot)
npx tsx scripts/migrate-memory.ts
```

There is **no test framework configured** — no `test` script, no jest/vitest config. Don't claim a feature is verified by tests; verify in the browser or via the relevant tsx entry point.

### Python NeMo Agent Toolkit (NAT) sidecar

`nat/` is a separate Python project (Python 3.11+, managed with `uv`) that exposes an alternative ReAct agent runtime via FastAPI on :8000. It is independent of the Node app and only used when running NAT-backed flows.

```bash
./bin/setup-nat                # creates nat/.venv via uv, installs nvidia-nat[...]
./bin/start-all                # runs setup-nat if needed, then `nat serve` + `npm run dev`

# Inside nat/ with .venv active:
nat run    --config_file configs/dory_workflow.yml --input "..."
nat serve  --config_file configs/dory_workflow.yml      # FastAPI on :8000
nat eval   --config_file configs/eval_config.yml
nat mcp    --config_file configs/mcp_server.yml
```

### Service ports

| Port | Service |
|------|---------|
| 3000 | Next.js UI + `/api/*` routes |
| 3001 | `flywheel-api.ts` (Express, external logging endpoints) |
| 8000 | NAT FastAPI (Python sidecar, optional) |
| 9200 | Elasticsearch (flywheel trace store, optional) |

## Architecture

There are **three runtimes** in this repo, all wired around the same `lib/agents/` core:

1. **Next.js app** (`app/`) — UI + REST routes under `app/api/*`. The main agent endpoint is `/api/agents/run` (used by the UI) and there's also `/api/mcp-chat` (uses `MCPAgent` over MCP), `/api/agents/coder`, `/api/terminal` (websocket), `/api/flywheel`, `/api/dashboard`, `/api/webhook`, `/api/settings/api-key`, `/api/health`, `/api/logs`, `/api/shutdown`.
2. **MCP stdio servers** (`mcp-server.ts`, `mcp-server-minimal.ts`) — expose the same `lib/agents/tools/*` over the Model Context Protocol so external MCP clients (Claude Desktop, Kiro, etc.) can drive them. `mcp-server.ts` also wires the full orchestration (`runDoryAgent` from `lib/agents/mcp-agent-runner.ts`) as a single MCP tool.
3. **Flywheel API** (`flywheel-api.ts`) — Express server on :3001 for external clients to log conversations into Elasticsearch / SFT/DPO trace dirs. Independent of the Next.js process.

`mcp-server.ts` and `flywheel-api.ts` are intentionally **excluded from `tsconfig.json`** — they're standalone `tsx` entry points and edits there will not surface in `next build`/`next lint`.

### Agent core (`lib/agents/`)

`lib/agents/agent.ts` is the canonical orchestrator. Its constructor takes a set of components that are all **mandatory** (not optional) — when adding a new caller, instantiate every one or the agent will throw:

- `flywheelLogger` (`flywheel/logger.ts`) — logs every interaction; SFT/DPO routing via `quality-filter.ts`, optional Elasticsearch sink (`elasticsearch-sink.ts`)
- `unifiedContext` (`unified-context.ts`) — the single working context shared with tools
- `toolOrchestrator` (`tool-orchestrator.ts`) — sequences tool calls, tracks results
- `feedbackOptimizer` (`feedback-optimizer.ts`) — evolves the system prompt across turns
- `autoRAGUpdater` (`rag/auto-updater.ts`) — keeps the RAG index in sync with file edits
- `evaluator` (`flywheel/evaluator.ts`) — scores trajectories
- Plus `Tracer` (`observability/tracer.ts`), `PIIGuard` (`security/pii-guard.ts`), `ContextManager` (`context-manager.ts`), and the hook system in `hooks.ts`

`lib/agents/mcp-agent-runner.ts` (`runDoryAgent`) is the canonical wiring of all of the above as singletons; both the Next.js routes and `mcp-server.ts` go through it. `MCPAgent` (`lib/agents/mcp-agent.ts`) is a lighter alternative that talks to an MCP server for tool discovery instead of using the in-process registry.

### Tool registry

`lib/agents/tools/registry.ts` (`createToolRegistry`) is the **single source of truth** for tools available to the in-process agent. New tools must be added here AND re-exported from `lib/agents/index.ts` AND registered in `mcp-server.ts` (manually, by calling `server.registerTool` per tool) if they should also be exposed over MCP.

Tool categories: project (`set_project`, `get_project`), filesystem, bash, think, memory (3 variants — see "Memory" below), web search (Perplexity, Tavily), local docs, GitHub, code documentation, Mermaid, RAG (`rag_ingest`/`search`/`query`/`research`/`stats`/`clear`/`validate`/`update`), vision (`vision_analyze`, `ios_ui_review`, `compare_mockup`), reflection, and report specialists (planner / section-author / writer / reviewer / extender / compiler / dedupe). The `.project-context` lists 38 tools — keep that in mind when changing the registry.

### RAG (`lib/agents/rag/`)

Two pipelines coexist: `pipeline.ts` (legacy) and `pipeline-v2.ts` (current, NVIDIA RAG Blueprint). Use V2 unless you have a reason. V2 is hybrid BM25 + vector with RRF fusion (`hybrid-retriever.ts`), `ContextualCompressionRetriever` for wide→rerank→narrow, Swift-aware chunking (`text-splitter.ts`'s `SwiftTextSplitter`), query decomposition, a self-correction reflection loop, and persists to `.rag-store.json`. Profiles live in `config.ts` (`IOS_DEVELOPMENT_PROFILE`, `RESEARCH_AGENT_PROFILE`, `CHATBOT_PROFILE`); `getRAGProfile()` picks one. Embeddings/reranking go through `nvidia/llama-3.2-nv-embedqa-1b-v2` and `nvidia/llama-3.2-nv-rerankqa-1b-v2` via `embeddings.ts`.

### Flywheel (`lib/agents/flywheel/`)

Every agent run produces a `FlywheelRecord`. `quality-filter.ts` computes a reward and routes records into `sft_traces/`, `dpo_traces/`, or `dlq/` (created by `start.sh`). `elasticsearch-sink.ts` bulk-ingests into the `nvidia-cli-traces` index; failures land in the DLQ and are retried by `error-monitor.ts`. The Express endpoints in `flywheel-api.ts` mirror this for external clients.

### Memory

Three tools exist for historical reasons: `MemoryTool`, `EntityMemoryTool`, and `UnifiedMemoryTool`. The unified store (`lib/agents/memory/unified-store.ts`) is the target — `scripts/migrate-memory.ts` migrates legacy `long-term.json` and `vector-memory.json` into it. Persisted under `~/.nvidia-cli/memory/` (outside the repo).

### Front-end state

UI state is Zustand with `localStorage` persistence (`lib/store/index.ts`, `lib/store/conversations.ts`, `lib/store/agent-sessions.ts`). Stores are namespaced `nvidia-cli-*` (e.g. `nvidia-cli-projects`, `nvidia-cli-settings`, `nvidia-cli-ui`, `nvidia-cli-usage`, `nvidia-cli-prompts`). UI components in `components/` use Radix primitives + Tailwind (config in `tailwind.config.ts`); the in-app terminal is xterm.js + node-pty over the websocket served by `lib/terminal-server.ts`.

## Conventions and gotchas

- **Path alias**: `@/*` → repo root (defined in `tsconfig.json`). Use `@/lib/...`, `@/components/...` in app code.
- **TypeScript strict mode is on**, but `mcp-server.ts` and `flywheel-api.ts` are excluded from the project — they are run via `tsx` and don't get type-checked by `next build`. ESLint rules (`.eslintrc.json`) only `warn` on `no-unused-vars`, `no-explicit-any`, `prefer-const`, and `react/no-unescaped-entities`.
- **API keys**: `lib/api-key.ts` exports hardcoded `NVIDIA_API_KEY` and `PERPLEXITY_API_KEY`. The repo treats this as acceptable (private repo, free-tier, swappable) — do not "fix" it by moving to env vars unless asked. The same key is also hardcoded inline in `mcp-server.ts` and `mcp-server-minimal.ts`; if it's rotated, update all three.
- **Hardcoded macOS paths**: `lib/config.ts` and `start.sh` reference `/Users/home/Documents/nvidia-cli` and `/Users/home/.nvidia-cli/`. The app is single-user on macOS by design — don't generalize these unless asked.
- **Local LLM toggle**: `USE_LOCAL_LLM` appears as the literal expression `"false" === "true"` in `lib/nvidia.ts`, `lib/agents/agent.ts`, and `lib/agents/mcp-agent.ts` (always false at compile time). Flipping to local Ollama means changing those constants in all three files; there is no env-var switch.
- **Context windows differ by backend**: hosted `integrate.api.nvidia.com` caps Nemotron 3 Nano at 262,144 tokens; self-hosted NIM / Ollama goes to 1,000,000. `NVIDIA_MODELS` in `lib/nvidia.ts` exposes both via `nativeContextWindow`/`hostedContextWindow`.
- **Default model everywhere is `nvidia/nemotron-3-nano-30b-a3b`**. Note that `nat/configs/dory_workflow.yml` defines a second LLM `nim_nemotron_70b` whose `model_name` is set to `claude-opus-4.5` — that's intentional in the YAML; don't "fix" the name unless asked.
- **Duplicate files** like `lib/nat-client 2.ts`, `lib/agents/tools/project 2.ts`, `bin/setup-nat 2`, `bin/start-all 2`, `nat/pyproject 2.toml` are macOS Finder duplicates. Edit the non-suffixed file; the ` 2` versions are stale.
- **`.gitignore`** ignores `.rag-store.json`, `elasticsearch-8.11.0/`, `.claude/`, `.gemini`, `.codex`, and `*.rtf` / `nvidia-nim-keys*` / `*.pem` / `*.key` for secrets.
- **Branch convention**: development happens on `claude/...` branches (current: `claude/add-claude-documentation-6ZnqG`). Push to the assigned branch, then open a draft PR.
