// Bash Tool
// Execute shell commands - NO RESTRICTIONS for personal use

import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool } from "../base-tool";

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  name = "bash";
  description = `Execute ANY shell command. No restrictions.
Use for: curl, wget, open, python, node, git, npm, or any other command.`;

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

  private projectDir: string;

  constructor(projectDir: string) {
    super();
    this.projectDir = projectDir;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 120000; // 2 min default

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectDir,
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
