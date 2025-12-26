// GitHub Repository Analyzer Tool
// Clone and analyze any public GitHub repository

import { BaseTool } from "../base-tool";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// Timeouts in ms
const CLONE_TIMEOUT = 300000;  // 5 min for large repos
const PULL_TIMEOUT = 120000;   // 2 min for updates
const FIND_TIMEOUT = 60000;    // 1 min for file operations

export class GitHubAnalyzerTool extends BaseTool {
  name = "github_analyzer";
  description = `Analyze a GitHub repository structure and code.
Operations:
- clone: Clone a public repo to temp directory
- structure: Get directory tree and file list
- readme: Get README content
- files: List files by extension
- dependencies: Extract package.json/requirements.txt deps
- analyze: Full analysis (structure + readme + deps)`;

  parameters = {
    operation: {
      type: "string",
      enum: ["clone", "structure", "readme", "files", "dependencies", "analyze"],
      description: "Analysis operation to perform",
    },
    repo_url: {
      type: "string",
      description: "GitHub repo URL (e.g., https://github.com/owner/repo)",
    },
    extension: {
      type: "string",
      description: "File extension to filter (for 'files' operation)",
      optional: true,
    },
    max_depth: {
      type: "integer",
      description: "Max directory depth (default: 3)",
      optional: true,
    },
  };

  private tempDir = "/tmp/nvidia-cli-repos";

  private getRepoPath(repoUrl: string): string {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?\#]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    const repoName = match[2].replace(/\.git$/, "");
    return path.join(this.tempDir, `${match[1]}-${repoName}`);
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const repoUrl = args.repo_url as string;
    const extension = args.extension as string;
    const maxDepth = (args.max_depth as number) || 3;

    try {
      await fs.mkdir(this.tempDir, { recursive: true });

      switch (operation) {
        case "clone":
          return await this.cloneRepo(repoUrl);
        case "structure":
          return await this.getStructure(repoUrl, maxDepth);
        case "readme":
          return await this.getReadme(repoUrl);
        case "files":
          return await this.getFilesByExtension(repoUrl, extension || "*");
        case "dependencies":
          return await this.getDependencies(repoUrl);
        case "analyze":
          return await this.fullAnalysis(repoUrl, maxDepth);
        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async cloneRepo(repoUrl: string): Promise<string> {
    const repoPath = this.getRepoPath(repoUrl);
    
    try {
      await fs.access(repoPath);
      // Already exists, pull latest
      await execAsync(`cd "${repoPath}" && git pull`, { timeout: PULL_TIMEOUT });
      return `Repository updated at ${repoPath}`;
    } catch {
      // Clone fresh
      await execAsync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, { timeout: CLONE_TIMEOUT });
      return `Repository cloned to ${repoPath}`;
    }
  }

  private async getStructure(repoUrl: string, maxDepth: number): Promise<string> {
    await this.cloneRepo(repoUrl);
    const repoPath = this.getRepoPath(repoUrl);
    
    const { stdout } = await execAsync(
      `find "${repoPath}" -maxdepth ${maxDepth} -type f -o -type d | grep -v ".git" | head -200`,
      { timeout: FIND_TIMEOUT }
    );
    
    const lines = stdout.trim().split("\n").map(l => l.replace(repoPath, "."));
    return `## Repository Structure\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
  }

  private async getReadme(repoUrl: string): Promise<string> {
    await this.cloneRepo(repoUrl);
    const repoPath = this.getRepoPath(repoUrl);
    
    const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
    
    for (const readme of readmeFiles) {
      try {
        const content = await fs.readFile(path.join(repoPath, readme), "utf-8");
        return `## README\n\n${content.substring(0, 10000)}`;
      } catch {
        continue;
      }
    }
    return "No README found";
  }

  private async getFilesByExtension(repoUrl: string, ext: string): Promise<string> {
    await this.cloneRepo(repoUrl);
    const repoPath = this.getRepoPath(repoUrl);
    
    const pattern = ext === "*" ? "*" : `*.${ext}`;
    const { stdout } = await execAsync(
      `find "${repoPath}" -name "${pattern}" -type f | grep -v ".git" | head -100`,
      { timeout: FIND_TIMEOUT }
    );
    
    const files = stdout.trim().split("\n").filter(Boolean).map(f => f.replace(repoPath, "."));
    return `## Files (${ext})\n\`\`\`\n${files.join("\n")}\n\`\`\``;
  }

  private async getDependencies(repoUrl: string): Promise<string> {
    await this.cloneRepo(repoUrl);
    const repoPath = this.getRepoPath(repoUrl);
    const deps: string[] = [];

    // package.json (Node.js)
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(repoPath, "package.json"), "utf-8"));
      deps.push("## Node.js Dependencies");
      if (pkg.dependencies) {
        deps.push("### Dependencies");
        deps.push(...Object.entries(pkg.dependencies).map(([k, v]) => `- ${k}: ${v}`));
      }
      if (pkg.devDependencies) {
        deps.push("### Dev Dependencies");
        deps.push(...Object.entries(pkg.devDependencies).map(([k, v]) => `- ${k}: ${v}`));
      }
    } catch {}

    // requirements.txt (Python)
    try {
      const reqs = await fs.readFile(path.join(repoPath, "requirements.txt"), "utf-8");
      deps.push("## Python Dependencies");
      deps.push("```");
      deps.push(reqs.trim());
      deps.push("```");
    } catch {}

    // pyproject.toml (Python)
    try {
      const pyproject = await fs.readFile(path.join(repoPath, "pyproject.toml"), "utf-8");
      if (pyproject.includes("[project.dependencies]") || pyproject.includes("dependencies")) {
        deps.push("## Python (pyproject.toml)");
        deps.push("```toml");
        deps.push(pyproject.substring(0, 3000));
        deps.push("```");
      }
    } catch {}

    // Cargo.toml (Rust)
    try {
      const cargo = await fs.readFile(path.join(repoPath, "Cargo.toml"), "utf-8");
      deps.push("## Rust Dependencies");
      deps.push("```toml");
      deps.push(cargo.substring(0, 2000));
      deps.push("```");
    } catch {}

    // go.mod (Go)
    try {
      const gomod = await fs.readFile(path.join(repoPath, "go.mod"), "utf-8");
      deps.push("## Go Dependencies");
      deps.push("```");
      deps.push(gomod.substring(0, 2000));
      deps.push("```");
    } catch {}

    return deps.length > 0 ? deps.join("\n") : "No dependency files found";
  }

  private async fullAnalysis(repoUrl: string, maxDepth: number): Promise<string> {
    const results: string[] = [];
    
    results.push(`# Repository Analysis: ${repoUrl}\n`);
    results.push(await this.getReadme(repoUrl));
    results.push("\n---\n");
    results.push(await this.getStructure(repoUrl, maxDepth));
    results.push("\n---\n");
    results.push(await this.getDependencies(repoUrl));
    
    // Count files by type
    const repoPath = this.getRepoPath(repoUrl);
    try {
      const { stdout } = await execAsync(
        `find "${repoPath}" -type f | grep -v ".git" | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -15`,
        { timeout: FIND_TIMEOUT }
      );
      results.push("\n---\n## File Types\n```");
      results.push(stdout.trim());
      results.push("```");
    } catch {}

    return results.join("\n");
  }
}

// Tool to read specific files from cloned repos
export class GitHubFileReaderTool extends BaseTool {
  name = "github_file_reader";
  description = `Read specific files from a cloned GitHub repository.
Use after github_analyzer clone operation.`;

  parameters = {
    repo_url: {
      type: "string",
      description: "GitHub repo URL",
    },
    file_path: {
      type: "string",
      description: "Path to file within repo (e.g., src/main.py)",
    },
    max_lines: {
      type: "integer",
      description: "Max lines to read (default: 500)",
      optional: true,
    },
  };

  private tempDir = "/tmp/nvidia-cli-repos";

  async execute(args: Record<string, unknown>): Promise<string> {
    const repoUrl = args.repo_url as string;
    let filePath = args.file_path as string;
    const maxLines = (args.max_lines as number) || 500;

    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?\#]+)/);
    if (!match) return "Invalid GitHub URL";

    const repoName = match[2].replace(/\.git$/, "");
    
    // Clean file_path: remove repo name prefix if LLM included it
    if (filePath.startsWith(repoName + "/")) {
      filePath = filePath.slice(repoName.length + 1);
    }
    // Also handle if just the suffix was included (e.g., "com/CNAME" from "apple.caserlegal.com")
    const dotParts = repoName.split(".");
    for (let i = 1; i < dotParts.length; i++) {
      const suffix = dotParts.slice(i).join(".") + "/";
      if (filePath.startsWith(suffix)) {
        filePath = filePath.slice(suffix.length);
        break;
      }
    }
    
    // Remove leading slashes/dots
    filePath = filePath.replace(/^[\.\/]+/, "");

    const fullPath = path.join(this.tempDir, `${match[1]}-${repoName}`, filePath);

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n").slice(0, maxLines);
      const ext = path.extname(filePath).slice(1) || "txt";
      return `## ${filePath}\n\`\`\`${ext}\n${lines.join("\n")}\n\`\`\``;
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
