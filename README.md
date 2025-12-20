<p align="center">
  <img src="public/nvidia-logo.webp" alt="NVIDIA CLI" width="120" />
</p>

<h1 align="center">NVIDIA CLI</h1>

<p align="center">
  <strong>A powerful, privacy-first AI assistant powered by NVIDIA NIM</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#modes">Modes</a> •
  <a href="#models">Models</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#api-reference">API</a>
</p>

---

## Overview

NVIDIA CLI [codename: **dory**] is a full-featured AI application powered by NVIDIA's NIM (NVIDIA Inference Microservices) API. It provides a terminal-like interface with multiple agent modes, real tool execution, and multi-model support.

**Default Model:** Nemotron Super 49B - 128K context, optimized for agentic coding tasks

---

## Features

### 🎯 Core Chat
- **Multi-model support** - 10+ NVIDIA NIM models
- **Streaming responses** - Real-time token streaming with metrics
- **Markdown rendering** - Full GFM support with syntax highlighting
- **Conversation management** - Create, rename, pin, archive, search
- **Message editing** - Edit and regenerate any message

### 🤖 Real Tool Execution
- **File operations** - Read, write, list directories
- **Shell commands** - Execute bash commands (sandboxed)
- **Thinking** - Internal reasoning for complex problems
- **Project-scoped** - Tools sandboxed to working directory

### 🎨 Artifacts
- **Code blocks** - Syntax highlighted with 50+ languages
- **HTML/CSS** - Live preview with sandboxed iframe
- **React components** - Live rendering
- **Mermaid diagrams** - Flowcharts, sequence diagrams
- **SVG graphics** - Vector graphics preview

### ⚙️ Advanced
- **Command palette** - Quick actions (Cmd+K)
- **Keyboard shortcuts** - Full keyboard navigation
- **Settings** - API key, theme, default model
- **Session management** - Running agents sidebar

---

## Modes

Switch modes from the header dropdown. All modes use the same underlying tools but with specialized system prompts.

### 💬 Talk Mode
General-purpose coding assistant with file and command access.
```
[you] What files are in this directory?
⚡ file_read({"path": ".", "operation": "list"})
[dory] Found 12 files including package.json, src/, ...
```

### 🖥️ Control Mode
Computer automation - open apps, run scripts, system commands.
```
[you] Open Safari and go to github.com
⚡ bash({"command": "open -a Safari https://github.com"})
[dory] Opened Safari with GitHub.
```

### 🌐 Browse Mode
Web browsing assistant - search, fetch URLs, save content.
```
[you] Search for Next.js 15 release notes
⚡ bash({"command": "open 'https://google.com/search?q=Next.js+15+release+notes'"})
[dory] Opened Google search. Key changes include...
```

### 🔬 Research Mode
Deep research with structured reports and citations.
```
[you] Research the latest developments in quantum computing
⚡ think({"thought": "Planning research strategy..."})
[dory] ## Research: Quantum Computing 2024
### Key Findings
- IBM announced 1000+ qubit processor...
```

### 💻 Code Mode
Autonomous coder with project directory selection.

### 🖥️ Terminal Mode
Direct terminal access for manual commands.

---

## Models

### Available Models (December 2024)

| Model | Context | Best For |
|-------|---------|----------|
| **Nemotron Super 49B** (default) | 128K | Agentic coding tasks |
| **Nemotron 3 Nano** | 1M | Fast reasoning, 3.3x throughput |
| **Nemotron Ultra 253B** | 128K | Maximum capability |
| **Qwen3 Coder 480B** | 128K | Code generation specialist |
| **Devstral 2 123B** | 128K | Development tasks |
| **DeepSeek R1** | 128K | Math, reasoning |
| **DeepSeek V3.2** | 128K | Hybrid inference |
| **Llama 3.3 70B** | 128K | General purpose |
| **Qwen3 235B** | 128K | Strong reasoning |
| **Nemotron Nano VL 8B** | 128K | Vision/images |

---

## Getting Started

### Prerequisites
- Node.js 18+
- NVIDIA API Key ([Get one free](https://build.nvidia.com))

### Installation

```bash
# Clone
git clone https://github.com/yourusername/nvidia-cli.git
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

## API Reference

### Agent Chat Endpoint

```
POST /api/agent-chat
```

Supports all modes with real tool execution.

```typescript
// Request
{
  messages: [{ role: "user", content: "List files" }],
  projectDir: "/path/to/project",
  mode: "chat" | "computer" | "browser" | "research"
}

// Response (SSE)
data: {"type":"status","status":"running"}
data: {"type":"tool_call","name":"file_read","args":"..."}
data: {"type":"tool_result","result":"..."}
data: {"type":"message","role":"assistant","content":"..."}
data: {"type":"done"}
```

### Chat Endpoint

```
POST /api/chat
```

Standard chat completion without tools.

```typescript
// Request
{
  messages: [{ role: "user", content: "Hello" }],
  model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  temperature: 0.7,
  maxTokens: 16384,
  stream: true
}
```

---

## Tools

| Tool | Description | Example |
|------|-------------|---------|
| `file_read` | Read files, list directories | `{"path": "src/", "operation": "list"}` |
| `file_write` | Create/edit files | `{"path": "test.js", "content": "..."}` |
| `bash` | Execute shell commands | `{"command": "npm test"}` |
| `think` | Internal reasoning | `{"thought": "Analyzing..."}` |

### Security
- **Path sandboxing** - Tools restricted to project directory
- **Command allowlist** - Only safe commands (npm, git, ls, cat, etc.)
- **No arbitrary code execution**

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
- **API:** NVIDIA NIM (OpenAI-compatible)

---

## Project Structure

```
nvidia-cli/
├── app/
│   ├── api/
│   │   ├── chat/          # Chat completion
│   │   ├── agent-chat/    # Multi-mode agent
│   │   └── agents/        # Agent management
│   ├── page.tsx           # Main page
│   └── globals.css
├── components/
│   ├── agents/            # AgentChat, Terminal, CoderPanel
│   ├── chat/              # Chat input, messages
│   ├── sidebar/           # Conversation list, sessions
│   ├── layout/            # Header with mode selector
│   └── ui/                # Radix primitives
├── lib/
│   ├── agents/            # Agent core, tools
│   │   ├── agent.ts       # Main agent loop
│   │   ├── types.ts       # TypeScript types
│   │   └── tools/         # file-read, file-write, bash, think
│   ├── store/             # Zustand stores
│   └── nvidia.ts          # NIM client & models
└── public/
    └── nvidia-logo.webp
```

---

## License

MIT

---

<p align="center">
  Built with ❤️ using <a href="https://nextjs.org">Next.js</a> and <a href="https://build.nvidia.com">NVIDIA NIM</a>
</p>
