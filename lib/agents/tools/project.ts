// Project Directory Tool
// Allows setting and getting the current working directory for the agent
// Persists state to disk for cross-request consistency

import { BaseTool } from "../base-tool";
import * as fs from "fs";
import * as path from "path";

// State file for persistence across requests
const STATE_FILE = "/tmp/nvidia-cli-project-state.json";

// Global state for current project directory
let currentProjectDir: string = process.cwd();

// Load persisted state on module initialization
function loadPersistedState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      const state = JSON.parse(data);
      if (state.projectDir && fs.existsSync(state.projectDir)) {
        currentProjectDir = state.projectDir;
        console.log(`[Project] Restored project directory: ${currentProjectDir}`);
      }
    }
  } catch (e) {
    // Ignore errors - use default
  }
}

// Persist state to disk
function persistState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ 
      projectDir: currentProjectDir,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.error("[Project] Failed to persist state:", e);
  }
}

// Initialize on module load
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
    let targetPath = args.path as string;
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
    
    // Auto-detect: if no .xcodeproj here but there's a subfolder with same name containing one, use that
    const contents = fs.readdirSync(expandedPath);
    const hasXcodeproj = contents.some(f => f.endsWith('.xcodeproj'));
    
    if (!hasXcodeproj) {
      const baseName = expandedPath.split('/').pop() || '';
      const nestedPath = `${expandedPath}/${baseName}`;
      if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isDirectory()) {
        const nestedContents = fs.readdirSync(nestedPath);
        if (nestedContents.some(f => f.endsWith('.xcodeproj'))) {
          // Found xcodeproj in nested folder with same name - use that instead
          setCurrentProjectDir(nestedPath);
          const finalContents = nestedContents.slice(0, 10);
          return `✅ Project directory set to: ${nestedPath} (auto-detected from nested folder)\n\nContents:\n${finalContents.map(f => `  - ${f}`).join('\n')}${finalContents.length >= 10 ? '\n  ...' : ''}`;
        }
      }
    }
    
    // Set the global project directory
    setCurrentProjectDir(expandedPath);
    
    // List contents to confirm
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
