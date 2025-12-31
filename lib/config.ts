/**
 * Application Configuration
 * Centralizes all configurable paths and settings
 */

import * as path from "path";
import { NVIDIA_API_KEY } from "./api-key";
import * as os from "os";
import { createLogger } from "./logger";

const log = createLogger("Config");

const HOME_DIR = os.homedir();
const DEFAULT_PROJECT_DIR = "/Users/home/Documents/nvidia-cli";

export const config = {
  projectDir: DEFAULT_PROJECT_DIR,
  
  mcp: {
    serverPath: "/Users/home/Documents/nvidia-cli/mcp-server.ts",
    serverCwd: "/Users/home/Documents/nvidia-cli",
  },
  
  storage: {
    memoryDir: "/Users/home/.nvidia-cli/memory",
    cacheDir: "/Users/home/.nvidia-cli/cache",
    projectStateFile: "/tmp/nvidia-cli-project-state.json",
    ragIndexDir: "/Users/home/.nvidia-cli/rag",
  },
  
  api: {
    nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
    ollamaBaseUrl: "http://localhost:11434/v1",
  },
  
  features: {
    useLocalLLM: false,
    traceExport: false,
    debugMode: false,
  },
  
  limits: {
    maxIterations: 1000,
    maxNudges: 3,
    llmTimeoutMs: 120000,
    maxFlywheelRecords: 500,
  },
};

if (!NVIDIA_API_KEY && !config.features.useLocalLLM) {
  log.warn("NVIDIA_API_KEY not set and USE_LOCAL_LLM is false");
}

export default config;
