# nvidia-cli

Dory is a local coding co-worker that calls NVIDIA NIM models (or a local OpenAI-compatible server) for tool use, retrieval, and project memory. Designed and developed by CASER, LLC.

## Run your own instance

Requirements: Node.js 18 or newer, and an API key from [build.nvidia.com](https://build.nvidia.com).

```bash
npm install
cp .env.example .env.local
# Edit .env.local. Set NVIDIA_API_KEY. Leave unused keys blank.
npm run dev
```

The web UI listens on http://localhost:3000.

`./start.sh` starts the UI from this checkout and, if you unpacked it here, Elasticsearch under `elasticsearch-8.11.0/`. Memory and RAG files default to `~/.nvidia-cli` in the account that runs the process. Point project tools at your own source tree; nothing in this repo is tied to a specific machine path.

Optional environment variables:

- `PERPLEXITY_API_KEY`, `TAVILY_API_KEY` — web search tools
- `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` — Google search tool
- `OLLAMA_BASE_URL` — local model endpoint instead of hosted NIM
- `LOCAL_EMBED_URL` — local embedding server

Do not commit `.env`, `.env.local`, or API keys. `npm run build` then `npm run start` runs a production build of the same app.

The MCP entry points are `mcp-server.ts` and `mcp-server-minimal.ts`. They read `NVIDIA_API_KEY` from the environment.
