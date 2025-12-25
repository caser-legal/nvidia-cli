// File Write Tool
// Write and edit files

import * as fs from "fs/promises";
import * as path from "path";
import { BaseTool, z } from "../base-tool";
import { getCurrentProjectDir } from "./project";

const schema = z.object({
  operation: z.enum(["write", "edit"]).default("write"),
  path: z.string().min(1, "path is required"),
  content: z.string().optional(),
  old_text: z.string().optional(),
  new_text: z.string().optional(),
}).refine(
  (data) => data.operation !== "write" || data.content,
  { message: "content is required for write operation", path: ["content"] }
).refine(
  (data) => data.operation !== "edit" || (data.old_text && data.new_text !== undefined),
  { message: "old_text and new_text are required for edit operation", path: ["old_text"] }
);

export class FileWriteTool extends BaseTool {
  name = "file_write";
  description = `Write or edit files.
Operations:
- write: Create or completely replace a file
- edit: Make targeted changes to parts of a file
Uses the current project directory (use set_project to change it).`;

  parameters = {
    operation: {
      type: "string",
      enum: ["write", "edit"],
      description: "File operation to perform",
    },
    path: {
      type: "string",
      description: "File path to write to or edit (relative to project or absolute)",
    },
    content: {
      type: "string",
      description: "Content to write (for write operation)",
      optional: true,
    },
    old_text: {
      type: "string",
      description: "Text to replace (for edit operation)",
      optional: true,
    },
    new_text: {
      type: "string",
      description: "Replacement text (for edit operation)",
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
    
    const { operation, path: filePath, content, old_text, new_text } = v.data as {
      operation: string; path: string; content?: string; old_text?: string; new_text?: string;
    };

    try {
      if (operation === "write") {
        return await this.writeFile(filePath, content!);
      } else {
        return await this.editFile(filePath, old_text!, new_text!);
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async writeFile(filePath: string, content: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    return `Successfully wrote ${content.length} characters to ${filePath}`;
  }

  private async editFile(filePath: string, oldText: string, newText: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return `Error: ${filePath} is not a file`;

    const content = await fs.readFile(resolved, "utf-8");
    if (!content.includes(oldText)) {
      // Provide actionable guidance - this is critical for agent retry logic
      const lines = content.split('\n');
      const preview = lines.slice(0, 10).join('\n');
      return `EDIT_FAILED: old_text not found in ${filePath}. 
ACTION REQUIRED: Read the file again with file_read to get exact text including whitespace.
File has ${lines.length} lines. First 10 lines:
${preview}
...
DO NOT hallucinate success. You MUST retry with correct old_text or use operation="write" to replace entire file.`;
    }

    const count = content.split(oldText).length - 1;
    if (count > 1) {
      return `EDIT_FAILED: Found ${count} occurrences of old_text in ${filePath}.
ACTION REQUIRED: Include more surrounding lines in old_text to make it unique.
DO NOT hallucinate success. You MUST retry with more context.`;
    }
    
    const newContent = content.replace(oldText, newText);
    await fs.writeFile(resolved, newContent, "utf-8");
    return `SUCCESS: Edited ${filePath} - replaced ${oldText.length} chars with ${newText.length} chars`;
  }
}
