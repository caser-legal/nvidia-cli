// Local Docs Search Tool
// Searches local documentation files using grep and file reading
// Useful for finding information in dev-docs before falling back to web search

import { BaseTool } from "../base-tool";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// Default paths to search for documentation
const DEFAULT_DOC_PATHS = [
  "/Users/home/Documents/iOS/dev-docs",
  "/Users/home/nvidia-cli/dev-docs.rtf",
];

interface SearchMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

export class LocalDocsSearchTool extends BaseTool {
  name = "local_docs_search";
  description = `Search local documentation files for information.
Use this BEFORE web search to check if the answer exists in local dev-docs.
Searches through markdown, text, and code files in the dev-docs folder.
Returns matching content with file paths and context.`;

  parameters = {
    query: {
      type: "string",
      description: "Search query - can be keywords, phrases, or code patterns",
    },
    file_types: {
      type: "string",
      description: "File extensions to search (comma-separated, e.g., 'md,txt,swift'). Default: md,txt,swift,ts,py",
      optional: true,
    },
    max_results: {
      type: "integer",
      description: "Maximum number of results to return (default: 10)",
      optional: true,
    },
  };

  private docPaths: string[];

  constructor(additionalPaths?: string[]) {
    super();
    this.docPaths = [...DEFAULT_DOC_PATHS, ...(additionalPaths || [])];
  }

  private async searchWithGrep(query: string, searchPath: string, fileTypes: string[]): Promise<SearchMatch[]> {
    const matches: SearchMatch[] = [];
    
    // Build grep command with file type filters
    const includeFlags = fileTypes.map(ext => `--include="*.${ext}"`).join(" ");
    const escapedQuery = query.replace(/['"\\]/g, "\\$&");
    
    try {
      // Use grep with context lines (-B2 -A2 for 2 lines before and after)
      const cmd = `grep -rniH ${includeFlags} -B2 -A2 "${escapedQuery}" "${searchPath}" 2>/dev/null | head -200`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
      
      if (!stdout.trim()) return matches;
      
      // Parse grep output
      const lines = stdout.split("\n");
      let currentMatch: SearchMatch | null = null;
      
      for (const line of lines) {
        if (line === "--") {
          // Separator between matches
          if (currentMatch) {
            matches.push(currentMatch);
            currentMatch = null;
          }
          continue;
        }
        
        // Parse line format: file:line:content or file-line-content (context)
        const matchResult = line.match(/^(.+?)[:-](\d+)[:-](.*)$/);
        if (matchResult) {
          const [, file, lineNum, content] = matchResult;
          const isMainMatch = line.includes(`:${lineNum}:`);
          
          if (isMainMatch) {
            if (currentMatch) matches.push(currentMatch);
            currentMatch = {
              file: file.replace(searchPath, "").replace(/^\//, ""),
              line: parseInt(lineNum),
              content: content.trim(),
              context: [],
            };
          } else if (currentMatch) {
            currentMatch.context.push(content.trim());
          }
        }
      }
      
      if (currentMatch) matches.push(currentMatch);
      
    } catch (error) {
      // grep returns exit code 1 if no matches, which throws an error
      // This is expected behavior, not an error
    }
    
    return matches;
  }

  private async searchRtfFile(query: string, filePath: string): Promise<SearchMatch[]> {
    const matches: SearchMatch[] = [];
    
    try {
      const content = await fs.readFile(filePath, "utf-8");
      // Strip RTF formatting (basic)
      const plainText = content
        .replace(/\{\\[^}]+\}/g, "")
        .replace(/\\[a-z]+\d*\s?/gi, "")
        .replace(/[{}]/g, "");
      
      const lines = plainText.split("\n");
      const queryLower = query.toLowerCase();
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(queryLower)) {
          const contextStart = Math.max(0, index - 2);
          const contextEnd = Math.min(lines.length, index + 3);
          
          matches.push({
            file: path.basename(filePath),
            line: index + 1,
            content: line.trim(),
            context: lines.slice(contextStart, contextEnd).map(l => l.trim()).filter(l => l),
          });
        }
      });
    } catch {
      // File not found or unreadable
    }
    
    return matches;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const fileTypesStr = (args.file_types as string) || "md,txt,swift,ts,py,json";
    const maxResults = Math.min(20, Math.max(1, (args.max_results as number) || 10));
    
    const fileTypes = fileTypesStr.split(",").map(t => t.trim());
    const allMatches: SearchMatch[] = [];
    
    // Search each doc path
    for (const docPath of this.docPaths) {
      try {
        const stat = await fs.stat(docPath);
        
        if (stat.isDirectory()) {
          const matches = await this.searchWithGrep(query, docPath, fileTypes);
          allMatches.push(...matches);
        } else if (docPath.endsWith(".rtf")) {
          const matches = await this.searchRtfFile(query, docPath);
          allMatches.push(...matches);
        }
      } catch {
        // Path doesn't exist, skip
      }
    }
    
    if (allMatches.length === 0) {
      return `No matches found in local documentation for: "${query}"\n\nSearched paths:\n${this.docPaths.map(p => `- ${p}`).join("\n")}\n\nConsider using web search for this query.`;
    }
    
    // Limit results
    const limitedMatches = allMatches.slice(0, maxResults);
    
    // Format output
    const output: string[] = [
      `## Local Documentation Search Results`,
      `Found ${allMatches.length} matches for "${query}" (showing ${limitedMatches.length})`,
      ``,
    ];
    
    limitedMatches.forEach((match, i) => {
      output.push(`### ${i + 1}. ${match.file}:${match.line}`);
      output.push(`\`\`\``);
      if (match.context.length > 0) {
        output.push(match.context.join("\n"));
      } else {
        output.push(match.content);
      }
      output.push(`\`\`\``);
      output.push(``);
    });
    
    if (allMatches.length > maxResults) {
      output.push(`... and ${allMatches.length - maxResults} more matches.`);
    }
    
    return output.join("\n");
  }
}
