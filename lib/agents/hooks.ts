/**
 * Hooks Executor
 * Actually executes the hooks defined in dory.json
 * This was completely missing from the system
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, statSync } from "fs";
import { createLogger } from "../logger";

const execAsync = promisify(exec);
const log = createLogger("Hooks");

export interface Hook {
  command: string;
  matcher?: string;
}

export interface HooksConfig {
  agentSpawn?: Hook[];
  preToolUse?: Hook[];
  postToolUse?: Hook[];
  stop?: Hook[];
}

let cachedConfig: HooksConfig | null = null;
let agentSpawnOutput: string | null = null;
let configMtime: number = 0;  // Track config file modification time

/**
 * Load hooks configuration from dory.json
 * Now with cache invalidation when file changes
 */
export function loadHooksConfig(): HooksConfig {
  const configPaths = [
    "/Users/home/.kiro/agents/dory.json",
    "/Users/home/.config/kiro/agents/dory.json",
  ];
  
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        // Check if file has changed since last load
        const stat = statSync(configPath);
        const mtime = stat.mtimeMs;
        
        if (cachedConfig !== null && mtime === configMtime) {
          return cachedConfig;
        }
        
        const content = readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        const hooks: HooksConfig = config.hooks || {};
        cachedConfig = hooks;
        configMtime = mtime;
        
        log.info(`Loaded hooks from ${configPath}`, { 
          agentSpawn: hooks.agentSpawn?.length || 0,
          postToolUse: hooks.postToolUse?.length || 0,
        });
        
        return hooks;
      } catch (e) {
        log.error(`Failed to load hooks from ${configPath}`, { error: String(e) });
      }
    }
  }
  
  const emptyConfig: HooksConfig = {};
  cachedConfig = emptyConfig;
  return emptyConfig;
}

/**
 * Execute agentSpawn hooks - MUST be called before any agent run
 * Returns the combined output which should be prepended to system prompt
 * Now refreshes if user-memory.md has changed
 */
export async function executeAgentSpawnHooks(): Promise<string> {
  // Check if user-memory.md has changed
  const userMemoryPath = "/Users/home/.kiro/memory/user-memory.md";
  let shouldRefresh = agentSpawnOutput === null;
  
  if (!shouldRefresh && existsSync(userMemoryPath)) {
    try {
      const stat = statSync(userMemoryPath);
      // Simple check: if file was modified in last 5 seconds, refresh
      if (Date.now() - stat.mtimeMs < 5000) {
        shouldRefresh = true;
        log.debug("user-memory.md recently modified, refreshing hooks");
      }
    } catch {
      // Ignore stat errors
    }
  }
  
  if (!shouldRefresh && agentSpawnOutput !== null) {
    return agentSpawnOutput;
  }
  
  const config = loadHooksConfig();
  if (!config.agentSpawn || config.agentSpawn.length === 0) {
    agentSpawnOutput = "";
    return agentSpawnOutput;
  }
  
  const outputs: string[] = [];
  
  for (const hook of config.agentSpawn) {
    try {
      const { stdout, stderr } = await execAsync(hook.command, {
        shell: "/bin/zsh",
        timeout: 5000,
        env: { HOME: "/Users/home" },
      });
      
      const output = (stdout + stderr).trim();
      if (output) {
        outputs.push(output);
        log.debug("agentSpawn hook executed", { command: hook.command.slice(0, 50) });
      }
    } catch (e) {
      log.error("agentSpawn hook failed", { command: hook.command, error: String(e) });
    }
  }
  
  agentSpawnOutput = outputs.join("\n\n");
  return agentSpawnOutput;
}

/**
 * Execute postToolUse hooks after a tool completes
 */
export async function executePostToolUseHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolOutput: string
): Promise<void> {
  const config = loadHooksConfig();
  if (!config.postToolUse || config.postToolUse.length === 0) return;
  
  for (const hook of config.postToolUse) {
    // Check matcher if specified
    if (hook.matcher && !toolName.includes(hook.matcher.replace("@nvidia-cli/", ""))) {
      continue;
    }
    
    try {
      const env = {
        HOME: "/Users/home",
        tool_name: toolName,
        tool_input: JSON.stringify(toolInput),
        tool_output: toolOutput.slice(0, 1000),
      };
      
      await execAsync(hook.command, {
        shell: "/bin/zsh",
        timeout: 5000,
        env,
      });
      
      log.debug("postToolUse hook executed", { toolName, command: hook.command.slice(0, 50) });
    } catch (e) {
      // Silent failure for post hooks - don't break the flow
      log.debug("postToolUse hook failed", { error: String(e) });
    }
  }
}

/**
 * Execute stop hooks when agent completes
 */
export async function executeStopHooks(): Promise<void> {
  const config = loadHooksConfig();
  if (!config.stop || config.stop.length === 0) return;
  
  for (const hook of config.stop) {
    try {
      await execAsync(hook.command, {
        shell: "/bin/zsh",
        timeout: 5000,
        env: { HOME: "/Users/home" },
      });
      log.debug("stop hook executed");
    } catch (e) {
      log.debug("stop hook failed", { error: String(e) });
    }
  }
}

/**
 * Reset cached state (for testing or new sessions)
 */
export function resetHooksCache(): void {
  cachedConfig = null;
  agentSpawnOutput = null;
  configMtime = 0;
}

/**
 * Get the agentSpawn output without re-executing
 */
export function getAgentSpawnOutput(): string {
  return agentSpawnOutput || "";
}

/**
 * Force refresh of hooks (call when user-memory.md changes)
 */
export function invalidateHooksCache(): void {
  agentSpawnOutput = null;
}
