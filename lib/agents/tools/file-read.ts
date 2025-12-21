// File Read Tool
// Read files and list directories

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { BaseTool } from "../base-tool";
import { getCurrentProjectDir } from "./project";

export class FileReadTool extends BaseTool {
  name = "file_read";
  description = `Read files or list directory contents.
Operations:
- read: Read the contents of a file
- list: List files in a directory
Uses the current project directory (use set_project to change it).`;

  parameters = {
    operation: {
      type: "string",
      enum: ["read", "list"],
      description: "File operation to perform",
    },
    path: {
      type: "string",
      description: "File path for read or directory path for list (relative to project or absolute)",
    },
    max_lines: {
      type: "integer",
      description: "Maximum lines to read (0 = no limit)",
      optional: true,
    },
    pattern: {
      type: "string",
      description: "Glob pattern to match files (for list)",
      optional: true,
    },
  };

  constructor() {
    super();
  }

  private resolvePath(inputPath: string): string {
    // Handle absolute paths and ~ expansion
    if (inputPath.startsWith("/")) {
      return inputPath;
    }
    if (inputPath.startsWith("~")) {
      return inputPath.replace(/^~/, process.env.HOME || "");
    }
    // Relative path - resolve from current project
    return path.resolve(getCurrentProjectDir(), inputPath);
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const filePath = args.path as string;
    const maxLines = (args.max_lines as number) || 0;
    const pattern = (args.pattern as string) || "*";

    try {
      if (operation === "read") {
        return await this.readFile(filePath, maxLines);
      } else if (operation === "list") {
        return await this.listFiles(filePath, pattern);
      }
      return `Error: Unknown operation '${operation}'`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async readFile(filePath: string, maxLines: number): Promise<string> {
    const resolved = this.resolvePath(filePath);
    const stat = await fs.stat(resolved);
    
    if (!stat.isFile()) {
      return `Error: ${filePath} is not a file`;
    }

    const content = await fs.readFile(resolved, "utf-8");
    
    if (maxLines > 0) {
      const lines = content.split("\n").slice(0, maxLines);
      return lines.join("\n");
    }
    
    return content;
  }

  private async listFiles(dirPath: string, pattern: string): Promise<string> {
    const resolved = this.resolvePath(dirPath);
    const stat = await fs.stat(resolved);
    
    if (!stat.isDirectory()) {
      return `Error: ${dirPath} is not a directory`;
    }

    const files = await glob(pattern, { cwd: resolved });
    
    if (files.length === 0) {
      return `No files found matching ${pattern}`;
    }

    const results: string[] = [];
    for (const file of files.sort()) {
      const fullPath = path.join(resolved, file);
      try {
        const fileStat = await fs.stat(fullPath);
        const prefix = fileStat.isDirectory() ? "📁" : "📄";
        results.push(`${prefix} ${file}${fileStat.isDirectory() ? "/" : ""}`);
      } catch {
        results.push(`📄 ${file}`);
      }
    }

    return results.join("\n");
  }
}
