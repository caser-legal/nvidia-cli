// Bash Tool
// Execute shell commands - NO RESTRICTIONS for personal use

import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool } from "../base-tool";
import { getCurrentProjectDir } from "./project";

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  name = "bash";
  description = `Execute ANY shell command. No restrictions.
Use for: curl, wget, open, python, node, git, npm, or any other command.
Commands run in the current project directory (use set_project to change it).`;

  parameters = {
    command: {
      type: "string",
      description: "The shell command to execute",
    },
    timeout: {
      type: "integer",
      description: "Timeout in milliseconds (default: 120000)",
      optional: true,
    },
  };

  constructor() {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    let command = args.command as string;
    const timeout = (args.timeout as number) || 120000; // 2 min default
    
    // Get current project directory
    const cwd = getCurrentProjectDir();
    
    // Auto-exclude build folders from grep to prevent huge outputs
    if (command.includes("grep -r") && !command.includes("--exclude-dir")) {
      command = command.replace("grep -r", "grep -r --exclude-dir=build --exclude-dir=.build --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=DerivedData --exclude-dir='.git'");
    }
    // Don't modify find commands - the injection was breaking syntax

    // Fix common command issues on macOS
    if (command.startsWith("python ") || command.startsWith("python\"") || command === "python") {
      command = command.replace(/^python(?=\s|"|$)/, "python3");
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
        shell: "/bin/zsh",
        env: {
          ...process.env,
          PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + process.env.PATH,
        },
      });

      let result = "";
      if (stdout) result += stdout;
      if (stderr) result += (result ? "\n" : "") + `[stderr] ${stderr}`;
      
      // Truncate output to prevent context overflow (max ~100K chars ≈ 25K tokens)
      const MAX_OUTPUT = 100000;
      if (result.length > MAX_OUTPUT) {
        result = result.slice(0, MAX_OUTPUT) + `\n... [truncated ${result.length - MAX_OUTPUT} chars to prevent context overflow]`;
      }
      
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
