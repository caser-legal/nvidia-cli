// File Write Tool - Write complete files

import * as fs from "fs/promises";
import * as path from "path";
import { BaseTool, z } from "../base-tool";
import { getCurrentProjectDir } from "./project";

const schema = z.object({
  path: z.string().min(1, "path is required"),
  content: z.string().min(1, "content is required"),
});

export class FileWriteTool extends BaseTool {
  name = "file_write";
  description = "Write files with complete content. Read file first, modify, write entire file back.";

  parameters = {
    path: {
      type: "string",
      description: "File path (relative to project or absolute)",
    },
    content: {
      type: "string",
      description: "Complete file content",
    },
  };
  
  protected schema = schema;

  private resolvePath(inputPath: string): string {
    if (inputPath.startsWith("/")) return inputPath;
    if (inputPath.startsWith("~")) return inputPath.replace(/^~/, "/Users/home" || "");
    return path.resolve(getCurrentProjectDir(), inputPath);
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const v = this.validate(args);
    if (!v.success) return `Error: ${v.error}`;
    
    const { path: filePath, content } = v.data as { path: string; content: string };

    try {
      const resolved = this.resolvePath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf-8");
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
