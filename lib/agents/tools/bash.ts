// Bash Tool
// Execute shell commands - sandboxed with allowlist

import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool } from "../base-tool";

const execAsync = promisify(exec);

// Allowlist of safe commands (from claude-quickstarts security.py)
const ALLOWED_COMMANDS = new Set([
  // File inspection
  "ls", "cat", "head", "tail", "wc", "grep", "find", "file", "stat", "du",
  // Node.js
  "npm", "npx", "node", "pnpm", "yarn", "bun",
  // Version control
  "git",
  // Process management
  "ps", "lsof", "sleep", "pkill",
  // Utilities
  "echo", "pwd", "cd", "mkdir", "rm", "cp", "mv", "touch", "chmod",
  // Build tools
  "make", "cargo", "python", "python3", "pip", "pip3",
]);

export class BashTool extends BaseTool {
  name = "bash";
  description = `Execute shell commands in the project directory.
Commands are restricted to a safe allowlist for security.
Allowed: ${Array.from(ALLOWED_COMMANDS).join(", ")}`;

  parameters = {
    command: {
      type: "string",
      description: "The shell command to execute",
    },
    timeout: {
      type: "integer",
      description: "Timeout in milliseconds (default: 30000)",
      optional: true,
    },
  };

  private projectDir: string;

  constructor(projectDir: string) {
    super();
    this.projectDir = projectDir;
  }

  private validateCommand(command: string): { valid: boolean; reason?: string } {
    const trimmed = command.trim();
    
    // Extract the base command (first word, ignoring env vars)
    const parts = trimmed.split(/\s+/);
    let baseCommand = parts[0];
    
    // Handle env var prefixes like "NODE_ENV=production npm run build"
    while (baseCommand.includes("=") && parts.length > 1) {
      parts.shift();
      baseCommand = parts[0];
    }
    
    // Handle path prefixes
    baseCommand = baseCommand.split("/").pop() || baseCommand;
    
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return {
        valid: false,
        reason: `Command '${baseCommand}' is not in the allowlist`,
      };
    }

    // Block dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      />\s*\//, // redirect to root
      /curl.*\|.*sh/, // curl pipe to shell
      /wget.*\|.*sh/,
      /eval\s/,
      /\$\(.*\)/, // command substitution (basic check)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          reason: "Command contains potentially dangerous pattern",
        };
      }
    }

    return { valid: true };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 30000;

    const validation = this.validateCommand(command);
    if (!validation.valid) {
      return `[BLOCKED] ${validation.reason}`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: {
          ...process.env,
          HOME: this.projectDir,
          PATH: process.env.PATH,
        },
      });

      let result = "";
      if (stdout) result += stdout;
      if (stderr) result += (result ? "\n" : "") + `[stderr] ${stderr}`;
      
      return result || "[Command completed with no output]";
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as Error & { stdout?: string; stderr?: string; code?: number };
        let msg = `Error (exit code ${execError.code || "unknown"}): ${error.message}`;
        if (execError.stdout) msg += `\n[stdout] ${execError.stdout}`;
        if (execError.stderr) msg += `\n[stderr] ${execError.stderr}`;
        return msg;
      }
      return `Error: ${String(error)}`;
    }
  }
}
