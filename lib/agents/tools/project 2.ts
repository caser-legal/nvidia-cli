// Project Directory Tool
// Allows setting and getting the current working directory for the agent

import { BaseTool } from "../base-tool";
import * as fs from "fs";
import * as path from "path";

// Global state for current project directory
let currentProjectDir: string = process.cwd();

export function getCurrentProjectDir(): string {
  return currentProjectDir;
}

export function setCurrentProjectDir(dir: string): void {
  currentProjectDir = dir;
}

export class SetProjectTool extends BaseTool {
  name = "set_project";
  description = `Set the current working directory for all file and bash operations.
Use this when the user wants to work on a specific project or folder.
Example: set_project("${process.env.HOME || ""}/Documents/iOS/MyApp")`;

  parameters = {
    path: {
      type: "string",
      description: "Absolute path to the project directory",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const targetPath = args.path as string;
    const expandedPath = targetPath.replace(/^~/, process.env.HOME || "");
    
    // Validate the path exists
    if (!fs.existsSync(expandedPath)) {
      return `Error: Directory does not exist: ${expandedPath}`;
    }
    
    // Validate it's a directory
    const stats = fs.statSync(expandedPath);
    if (!stats.isDirectory()) {
      return `Error: Path is not a directory: ${expandedPath}`;
    }
    
    // Set the global project directory
    setCurrentProjectDir(expandedPath);
    
    // List contents to confirm
    const contents = fs.readdirSync(expandedPath).slice(0, 10);
    
    return `✅ Project directory set to: ${expandedPath}\n\nContents:\n${contents.map(f => `  - ${f}`).join('\n')}${contents.length >= 10 ? '\n  ...' : ''}`;
  }
}

export class GetProjectTool extends BaseTool {
  name = "get_project";
  description = "Get the current working directory/project path";

  parameters = {};

  async execute(): Promise<string> {
    return `Current project directory: ${getCurrentProjectDir()}`;
  }
}
