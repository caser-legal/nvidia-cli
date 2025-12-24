// File Read Tool
// Read files and list directories

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { BaseTool, z } from "../base-tool";
import { getCurrentProjectDir } from "./project";

const schema = z.object({
  operation: z.enum(["read", "list"]),
  path: z.string().min(1, "path is required"),
  max_lines: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
});

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
  
  protected schema = schema;

  private resolvePath(inputPath: string): string {
    if (inputPath.startsWith("/")) return inputPath;
    if (inputPath.startsWith("~")) return inputPath.replace(/^~/, process.env.HOME || "");
    return path.resolve(getCurrentProjectDir(), inputPath);
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    
    const { operation, path: filePath, max_lines = 0, pattern = "*" } = v.data as {
      operation: string; path: string; max_lines?: number; pattern?: string;
    };

    try {
      if (operation === "read") {
        return await this.readFile(filePath, max_lines);
      } else {
        return await this.listFiles(filePath, pattern);
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async readFile(filePath: string, maxLines: number): Promise<string> {
    const resolved = this.resolvePath(filePath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return `Error: ${filePath} is not a file`;

    const content = await fs.readFile(resolved, "utf-8");
    if (maxLines > 0) return content.split("\n").slice(0, maxLines).join("\n");
    return content;
  }

  private async listFiles(dirPath: string, pattern: string): Promise<string> {
    const resolved = this.resolvePath(dirPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return `Error: ${dirPath} is not a directory`;

    const files = await glob(pattern, { cwd: resolved });
    if (files.length === 0) return `No files found matching ${pattern}`;

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
