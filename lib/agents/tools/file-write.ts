// File Write Tool
// Write and edit files - sandboxed to project directory

import * as fs from "fs/promises";
import * as path from "path";
import { BaseTool } from "../base-tool";

export class FileWriteTool extends BaseTool {
  name = "file_write";
  description = `Write or edit files.
Operations:
- write: Create or completely replace a file
- edit: Make targeted changes to parts of a file`;

  parameters = {
    operation: {
      type: "string",
      enum: ["write", "edit"],
      description: "File operation to perform",
    },
    path: {
      type: "string",
      description: "File path to write to or edit",
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

  private projectDir: string;

  constructor(projectDir: string) {
    super();
    this.projectDir = projectDir;
  }

  private resolvePath(inputPath: string): string {
    const resolved = path.resolve(this.projectDir, inputPath);
    if (!resolved.startsWith(this.projectDir)) {
      throw new Error("Access denied: path outside project directory");
    }
    return resolved;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const filePath = args.path as string;

    try {
      if (operation === "write") {
        const content = args.content as string;
        if (!content) return "Error: content is required for write operation";
        return await this.writeFile(filePath, content);
      } else if (operation === "edit") {
        const oldText = args.old_text as string;
        const newText = args.new_text as string;
        if (!oldText || newText === undefined) {
          return "Error: old_text and new_text are required for edit operation";
        }
        return await this.editFile(filePath, oldText, newText);
      }
      return `Error: Unknown operation '${operation}'`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async writeFile(filePath: string, content: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    
    // Create parent directories if needed
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    
    return `Successfully wrote ${content.length} characters to ${filePath}`;
  }

  private async editFile(filePath: string, oldText: string, newText: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return `Error: ${filePath} is not a file`;
    }

    const content = await fs.readFile(resolved, "utf-8");
    
    if (!content.includes(oldText)) {
      return `Error: The specified text was not found in ${filePath}`;
    }

    const count = content.split(oldText).length - 1;
    const newContent = content.replace(oldText, newText);
    await fs.writeFile(resolved, newContent, "utf-8");

    if (count > 1) {
      return `Warning: Found ${count} occurrences. Only first was replaced in ${filePath}`;
    }
    return `Successfully edited ${filePath}`;
  }
}
