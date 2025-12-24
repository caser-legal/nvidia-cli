// Project Directory Tool
// Allows setting and getting the current working directory for the agent

import { BaseTool } from "../base-tool";
import * as fs from "fs";
import { createLogger } from "../../logger";

const log = createLogger("Project");

const STATE_FILE = "/tmp/nvidia-cli-project-state.json";

let currentProjectDir: string = process.cwd();

function loadPersistedState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      const state = JSON.parse(data);
      if (state.projectDir && fs.existsSync(state.projectDir)) {
        currentProjectDir = state.projectDir;
        log.info(`Restored project directory: ${currentProjectDir}`);
      }
    }
  } catch {
    // Ignore errors - use default
  }
}

function persistState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ 
      projectDir: currentProjectDir,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    log.error("Failed to persist state", { error: String(e) });
  }
}

loadPersistedState();

export function getCurrentProjectDir(): string {
  return currentProjectDir;
}

export function setCurrentProjectDir(dir: string): void {
  currentProjectDir = dir;
  persistState();
}

export class SetProjectTool extends BaseTool {
  name = "set_project";
  description = `Set the current working directory for all file and bash operations.
Use this when the user wants to work on a specific project or folder.
Example: set_project("/Users/home/Documents/iOS/MyApp")`;

  parameters = {
    path: {
      type: "string",
      description: "Absolute path to the project directory",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const targetPath = args.path as string;
    const expandedPath = targetPath.replace(/^~/, process.env.HOME || "");
    
    if (!fs.existsSync(expandedPath)) {
      return `Error: Directory does not exist: ${expandedPath}`;
    }
    
    const stats = fs.statSync(expandedPath);
    if (!stats.isDirectory()) {
      return `Error: Path is not a directory: ${expandedPath}`;
    }
    
    const contents = fs.readdirSync(expandedPath);
    const hasXcodeproj = contents.some(f => f.endsWith('.xcodeproj'));
    
    if (!hasXcodeproj) {
      const baseName = expandedPath.split('/').pop() || '';
      const nestedPath = `${expandedPath}/${baseName}`;
      if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isDirectory()) {
        const nestedContents = fs.readdirSync(nestedPath);
        if (nestedContents.some(f => f.endsWith('.xcodeproj'))) {
          setCurrentProjectDir(nestedPath);
          const finalContents = nestedContents.slice(0, 10);
          return `✅ Project directory set to: ${nestedPath} (auto-detected from nested folder)\n\nContents:\n${finalContents.map(f => `  - ${f}`).join('\n')}${finalContents.length >= 10 ? '\n  ...' : ''}`;
        }
      }
    }
    
    setCurrentProjectDir(expandedPath);
    const displayContents = contents.slice(0, 10);
    
    return `✅ Project directory set to: ${expandedPath}\n\nContents:\n${displayContents.map(f => `  - ${f}`).join('\n')}${displayContents.length >= 10 ? '\n  ...' : ''}`;
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
