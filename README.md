<p align="center">
  <img src="public/nvidia-logo.webp" alt="NVIDIA CLI" width="120" />
</p>

<h1 align="center">NVIDIA CLI</h1>

<p align="center">
  <strong>A powerful, privacy-first chat interface powered by NVIDIA NIM</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#models">Models</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#agents">Agents</a> •
  <a href="#api-reference">API</a>
</p>

---

## Overview

NVIDIA CLI [codename: **dory**] is a full-featured AI application powered by NVIDIA's NIM (NVIDIA Inference Microservices) API. It provides an IDE-like interface with advanced features including multi-model support, agentic workflows, code execution, and artifact generation.

**Default Model:** Nemotron 3 Nano (Dec 2025) - 31.6B params, 3.6B active, 1M context, 3.3x faster than competitors

---

## Features

### 🎯 Core Chat
- **Multi-model support** - 10 NVIDIA NIM models optimized for coding
- **Streaming responses** - Real-time token streaming with metrics
- **Markdown rendering** - Full GFM support with syntax highlighting
- **Conversation management** - Create, rename, pin, archive, search
- **Message editing** - Edit and regenerate any message

### 🤖 CLI Agent Mode (dory)
- **Autonomous coding** - File read/write, shell commands
- **Tool execution** - Real-time tool calls with results
- **Thinking tags** - Hidden `<think>` blocks, clean output
- **Project-scoped** - Sandboxed to project directory

### 🎨 Artifacts
- **Code blocks** - Syntax highlighted with 50+ languages
- **HTML/CSS** - Live preview with sandboxed iframe
- **React components** - Live rendering
- **Mermaid diagrams** - Flowcharts, sequence diagrams
- **SVG graphics** - Vector graphics preview

### ⚙️ Advanced
- **Parallel reasoning** - Multiple reasoning paths (Nemotron 3 Nano)
- **Thinking budget** - Control reasoning depth
- **Custom instructions** - Global and per-project prompts
- **Command palette** - Quick actions (Cmd+K)
- **Keyboard shortcuts** - Full keyboard navigation

---

## Models

### Available Models (December 2025)

| Model | Context | Best For |
|-------|---------|----------|
| **Nemotron 3 Nano** (default) | 1M | Fast reasoning, 3.3x throughput |
| **Nemotron Super 49B** | 128K | Agentic coding tasks |
| **Nemotron Ultra 253B** | 128K | Maximum capability |
| **Qwen3 Coder 480B** | 128K | Code generation specialist |
| **Devstral 2 123B** | 128K | Development tasks |
| **DeepSeek R1** | 128K | Math, reasoning |
| **DeepSeek V3.2** | 128K | Hybrid inference |
| **Llama 3.3 70B** | 128K | General purpose |
| **Qwen3 235B** | 128K | Strong reasoning |
| **Nemotron Nano VL 8B** | 128K | Vision/images |

### Nemotron 3 Nano Features
- **Hybrid Mamba-Transformer MoE** architecture
- **31.6B total params, 3.6B active** per token
- **1M token context window**
- **Reasoning ON/OFF modes** + thinking budget
- **3.3x faster** than Qwen3-30B

---

## Getting Started

### Prerequisites
- Node.js 18+
- NVIDIA API Key ([Get one here](https://build.nvidia.com))

### Installation

```bash
# Clone
git clone https://github.com/caser-legal/nvidia-cli.git
cd nvidia-cli

# Install
npm install

# Configure
cp .env.example .env.local
# Add your NVIDIA_API_KEY to .env.local

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Agents

### CLI Agent (dory)

Terminal-like interface with real tool execution:

```
[user] analyze /path/to/project
● running
⚡ file_read({"path": ".", "operation": "list"})
📄 package.json
📄 src/
[dory] Found a Node.js project with the following structure...
● completed
```

### Available Tools

| Tool | Description |
|------|-------------|
| `file_read` | Read files, list directories |
| `file_write` | Create/edit files |
| `bash` | Execute shell commands (allowlisted) |
| `think` | Internal reasoning |

### Security
- **Path sandboxing** - Tools restricted to project directory
- **Command allowlist** - Only safe commands (npm, git, ls, etc.)
- **No arbitrary code execution**

---

## API Reference

### Chat Endpoint

```
POST /api/chat
```

```typescript
// Request
{
  messages: [{ role: "user", content: "Hello" }],
  model: "nvidia/nemotron-3-nano-30b-a3b",
  temperature: 1,
  maxTokens: 16384,
  stream: true,
  // Nemotron 3 Nano specific:
  parallelReasoningMode: "low" | "medium" | "heavy",
  reasoningBudget: 25,
  enableThinking: true
}

// Response (SSE)
data: {"type":"content","content":"Hello"}
data: {"type":"content","content":" there!"}
data: [DONE]
```

### Agent Chat Endpoint

```
POST /api/agent-chat
```

```typescript
// Request
{
  messages: [{ role: "user", content: "List files" }],
  projectDir: "/path/to/project"
}

// Response (SSE)
data: {"type":"status","status":"running"}
data: {"type":"tool_call","name":"file_read","args":"..."}
data: {"type":"tool_result","name":"file_read","result":"..."}
data: {"type":"message","role":"assistant","content":"..."}
data: {"type":"status","status":"completed"}
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd + K` | Command palette |
| `Cmd + N` | New conversation |
| `Cmd + /` | Toggle sidebar |
| `Cmd + ,` | Settings |
| `Enter` | Send message |
| `Shift + Enter` | New line |
| `Escape` | Close modal |

---

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS, shadcn/ui
- **State:** Zustand with localStorage persistence
- **Database:** SQLite (Prisma)
- **API:** NVIDIA NIM (OpenAI-compatible)

---

## Project Structure

```
nvidia-cli/
├── app/
│   ├── api/
│   │   ├── chat/          # Chat completion
│   │   ├── agent-chat/    # Agent mode
│   │   └── agents/        # Agent management
│   ├── page.tsx           # Main page
│   └── globals.css
├── components/
│   ├── agents/            # CLI chat, coder panel
│   ├── chat/              # Chat input, messages
│   ├── sidebar/           # Conversation list
│   └── ui/                # Radix primitives
├── lib/
│   ├── agents/            # Agent core, tools
│   ├── store/             # Zustand stores
│   └── nvidia.ts          # NIM client
└── prisma/
    └── schema.prisma
```

---

## License

MIT

---

<p align="center">
  Built with ❤️ using <a href="https://nextjs.org">Next.js</a> and <a href="https://build.nvidia.com">NVIDIA NIM</a>
</p>
