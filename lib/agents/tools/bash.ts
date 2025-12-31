// Bash Tool
// Execute shell commands with COMPREHENSIVE iOS device enforcement
// FIXED: Device rules are now cached with mtime-based invalidation

import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, statSync } from "fs";
import { BaseTool, z } from "../base-tool";
import { getCurrentProjectDir } from "./project";

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 300000;

const schema = z.object({
  command: z.string().min(1, "command is required"),
  timeout: z.number().int().positive().optional(),
});

interface DeviceConfig {
  primary_device?: {
    id: string;
    name: string;
    rule: string;
  };
}

interface DeviceRules {
  deviceId: string | null;
  neverSimulator: boolean;
}

// ============================================================================
// CACHED DEVICE RULES - Avoids reading files on every command
// ============================================================================

let cachedDeviceRules: DeviceRules | null = null;
let deviceConfigMtime: number = 0;
let userMemoryMtime: number = 0;

const DEVICE_CONFIG_PATHS = [
  "/Users/home/.kiro/settings/device.json",
  "/Users/home/.kiro/device.json",
];

const USER_MEMORY_PATHS = [
  "/Users/home/.kiro/memory/user-memory.md",
  "/Users/home/.kiro/user-memory.md",
];

function getFileMtime(paths: string[]): number {
  for (const path of paths) {
    if (existsSync(path)) {
      try {
        return statSync(path).mtimeMs;
      } catch {
        continue;
      }
    }
  }
  return 0;
}

function loadDeviceConfig(): DeviceConfig | null {
  for (const path of DEVICE_CONFIG_PATHS) {
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf-8"));
      } catch {
        continue;
      }
    }
  }
  return null;
}

function loadUserMemoryRules(): DeviceRules {
  for (const path of USER_MEMORY_PATHS) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const deviceMatch = content.match(/Device ID[`:\s]*([0-9A-Fa-f-]+)/i);
        const neverSim = content.toLowerCase().includes("never use simulator") || 
                         content.toLowerCase().includes("never install on sim");
        return {
          deviceId: deviceMatch ? deviceMatch[1] : null,
          neverSimulator: neverSim,
        };
      } catch {
        continue;
      }
    }
  }
  return { deviceId: null, neverSimulator: false };
}

function getDeviceRules(): DeviceRules {
  // Check if cache is valid
  const currentDeviceMtime = getFileMtime(DEVICE_CONFIG_PATHS);
  const currentMemoryMtime = getFileMtime(USER_MEMORY_PATHS);
  
  if (cachedDeviceRules !== null && 
      currentDeviceMtime === deviceConfigMtime && 
      currentMemoryMtime === userMemoryMtime) {
    return cachedDeviceRules;
  }
  
  // Cache miss or invalidated - reload
  const deviceConfig = loadDeviceConfig();
  const memoryRules = loadUserMemoryRules();
  
  cachedDeviceRules = {
    deviceId: deviceConfig?.primary_device?.id || memoryRules.deviceId,
    neverSimulator: memoryRules.neverSimulator || 
                    deviceConfig?.primary_device?.rule?.toLowerCase().includes("never") || false,
  };
  
  deviceConfigMtime = currentDeviceMtime;
  userMemoryMtime = currentMemoryMtime;
  
  return cachedDeviceRules;
}

/**
 * Invalidate device rules cache (for testing or manual refresh)
 */
export function invalidateDeviceRulesCache(): void {
  cachedDeviceRules = null;
  deviceConfigMtime = 0;
  userMemoryMtime = 0;
}

export class BashTool extends BaseTool {
  name = "bash";
  description = `Execute ANY shell command. No restrictions.
Use for: curl, wget, open, python, node, git, npm, or any other command.
Commands run in the current project directory (use set_project to change it).
Default timeout: 5 minutes. For long operations, pass a higher timeout value.

NOTE: iOS builds automatically use physical device from ~/.kiro/settings/device.json`;

  parameters = {
    command: {
      type: "string",
      description: "The shell command to execute",
    },
    timeout: {
      type: "integer",
      description: "Timeout in seconds (default: 300 = 5 minutes). Use higher values for downloads/builds.",
      optional: true,
    },
  };
  
  protected schema = schema;

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) {
      return `Error: ${(v as { success: false; error: string }).error}`;
    }
    
    let command = v.data.command as string;
    const timeoutInput = v.data.timeout as number | undefined;
    const timeout = timeoutInput ? timeoutInput * 1000 : DEFAULT_TIMEOUT_MS;
    const cwd = getCurrentProjectDir();
    
    // =========================================================================
    // iOS BUILD ENFORCEMENT - Comprehensive (now with cached rules)
    // =========================================================================
    const rules = getDeviceRules();
    const { deviceId, neverSimulator } = rules;
    
    // Check ALL build-related commands
    const isBuildCommand = 
      command.includes("xcodebuild") ||
      command.includes("xcrun devicectl") ||
      command.includes("ios-deploy") ||
      command.includes("swift build") ||
      (command.includes("xcrun") && command.includes("simctl"));
    
    if (isBuildCommand && neverSimulator) {
      // BLOCK: Explicit simulator usage
      const simulatorPatterns = [
        "platform=iOS Simulator",
        "platform=iOS,name=",
        "Simulator,name=",
        "simctl boot",
        "simctl install",
        "simctl launch",
        "-sdk iphonesimulator",
      ];
      
      for (const pattern of simulatorPatterns) {
        if (command.includes(pattern)) {
          return `❌ BLOCKED: Simulator usage is prohibited by user rules.

User rules say: "Never use simulator"
Required device ID: ${deviceId || 'Not configured'}

Fix your command to use physical device:
  -destination 'id=${deviceId}'

Or for generic iOS device:
  -destination 'generic/platform=iOS'`;
        }
      }
    }
    
    // AUTO-INJECT device ID for xcodebuild
    if (command.includes("xcodebuild") && deviceId) {
      // If no destination specified and this is a build command
      if (!command.includes("-destination") && 
          (command.includes(" build") || command.includes(" test") || command.includes(" archive"))) {
        const originalCommand = command;
        
        // Insert destination before the action
        const actions = [" build", " test", " archive", " clean"];
        for (const action of actions) {
          if (command.includes(action)) {
            command = command.replace(action, ` -destination 'id=${deviceId}'${action}`);
            break;
          }
        }
        
        // If no action found, append to end
        if (command === originalCommand) {
          command = `${command} -destination 'id=${deviceId}'`;
        }
        
        console.error(`[bash] Auto-injected device destination: ${deviceId}`);
        console.error(`[bash] Original: ${originalCommand}`);
        console.error(`[bash] Modified: ${command}`);
      }
    }
    
    // AUTO-INJECT device ID for xcrun devicectl
    if (command.includes("xcrun devicectl") && deviceId) {
      if (!command.includes("--device") && !command.includes(deviceId)) {
        command = command.replace("xcrun devicectl", `xcrun devicectl --device ${deviceId}`);
        console.error(`[bash] Auto-injected device for devicectl: ${deviceId}`);
      }
    }
    
    // AUTO-INJECT device ID for ios-deploy
    if (command.includes("ios-deploy") && deviceId) {
      if (!command.includes("--id") && !command.includes(deviceId)) {
        command = command.replace("ios-deploy", `ios-deploy --id ${deviceId}`);
        console.error(`[bash] Auto-injected device for ios-deploy: ${deviceId}`);
      }
    }
    
    // =========================================================================
    // STANDARD COMMAND PROCESSING
    // =========================================================================
    
    // Auto-exclude build folders from grep
    if (command.includes("grep -r") && !command.includes("--exclude-dir")) {
      command = command.replace("grep -r", "grep -r --exclude-dir=build --exclude-dir=.build --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=DerivedData --exclude-dir='.git'");
    }

    // Fix python -> python3 on macOS
    if (command.startsWith("python ") || command.startsWith("python\"") || command === "python") {
      command = command.replace(/^python(?=\s|"|$)/, "python3");
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 50,
        shell: "/bin/zsh",
        env: {
          PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
          HOME: "/Users/home",
          USER: "home"
        },
      });

      let result = "";
      if (stdout) result += stdout;
      if (stderr) result += (result ? "\n" : "") + `[stderr] ${stderr}`;
      
      const MAX_OUTPUT = 100000;
      if (result.length > MAX_OUTPUT) {
        result = result.slice(0, MAX_OUTPUT) + `\n... [truncated ${result.length - MAX_OUTPUT} chars]`;
      }
      
      return result || "[Command completed with no output]";
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as Error & { stdout?: string; stderr?: string; code?: number; killed?: boolean };
        
        if (execError.killed || error.message.includes('TIMEOUT')) {
          return `Error: Command timed out after ${timeout / 1000} seconds. For long operations (downloads, builds), pass a higher timeout value.`;
        }
        
        let msg = `Error (exit code ${execError.code || "unknown"}): ${error.message}`;
        if (execError.stdout) msg += `\n[stdout] ${execError.stdout}`;
        if (execError.stderr) msg += `\n[stderr] ${execError.stderr}`;
        return msg;
      }
      return `Error: ${String(error)}`;
    }
  }
}
