/**
 * Application Configuration
 * Centralizes all configurable paths and settings
 * Use environment variables or sensible defaults
 */

import * as path from "path";
import * as os from "os";

// Base directories
const HOME_DIR = os.homedir();
const DEFAULT_PROJECT_DIR = process.env.NVIDIA_CLI_PROJECT_DIR || path.join(HOME_DIR, "Documents", "nvidia-cli");

export const config = {
  // Project paths
  projectDir: DEFAULT_PROJECT_DIR,
  
  // MCP Server
  mcp: {
    serverPath: process.env.MCP_SERVER_PATH || path.join(DEFAULT_PROJECT_DIR, "mcp-server.ts"),
    serverCwd: process.env.MCP_SERVER_CWD || DEFAULT_PROJECT_DIR,
  },
  
  // Data storage
  storage: {
    memoryDir: process.env.NVIDIA_CLI_MEMORY_DIR || path.join(HOME_DIR, ".nvidia-cli", "memory"),
    cacheDir: process.env.NVIDIA_CLI_CACHE_DIR || path.join(HOME_DIR, ".nvidia-cli", "cache"),
    projectStateFile: process.env.NVIDIA_CLI_STATE_FILE || "/tmp/nvidia-cli-project-state.json",
    ragIndexDir: process.env.NVIDIA_CLI_RAG_DIR || path.join(HOME_DIR, ".nvidia-cli", "rag"),
  },
  
  // API endpoints
  api: {
    nvidiaBaseUrl: process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  },
  
  // Feature flags
  features: {
    useLocalLLM: process.env.USE_LOCAL_LLM === "true",
    traceExport: process.env.TRACE_EXPORT === "true",
    debugMode: process.env.DEBUG === "true",
  },
  
  // Limits
  limits: {
    maxIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || "1000", 10),
    maxNudges: parseInt(process.env.MAX_NUDGES || "3", 10),
    llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || "120000", 10),
    maxFlywheelRecords: parseInt(process.env.MAX_FLYWHEEL_RECORDS || "500", 10),
  },
};

// Validate critical config on import
if (!process.env.NVIDIA_API_KEY && !config.features.useLocalLLM) {
  console.warn("[Config] Warning: NVIDIA_API_KEY not set and USE_LOCAL_LLM is false");
}

export default config;
