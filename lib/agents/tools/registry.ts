/**
 * Tool Registry - Single source of truth for all tools
 * Eliminates duplicate tool definitions between mcp-server.ts and route.ts
 */

import { Tool } from "../types";
import { FileReadTool } from "./file-read";
import { FileWriteTool } from "./file-write";
import { NVIDIA_API_KEY } from "../../api-key";
import { BashTool } from "./bash";
import { ThinkTool } from "./think";
import { SetProjectTool, GetProjectTool } from "./project";
import { GoogleSearchTool } from "./google-search";
import { ParallelSearchTool } from "./parallel-search";
import { LocalDocsSearchTool } from "./local-docs-search";
import { MemoryTool, EntityMemoryTool } from "./memory";
import { UnifiedMemoryTool } from "./unified-memory";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "./mermaid-generator";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./code-documentation";
import { ReflectionTool, ExtendReportTool } from "./reflection";
import { ReportPlannerTool, SectionAuthorTool, ReportCompilerTool } from "./report-planner";

export interface ToolRegistryConfig {
  apiKey?: string;
  enableVision?: boolean;
  enableReports?: boolean;
}

/**
 * Create all tools with consistent configuration
 * Use this instead of instantiating tools directly
 */
export function createToolRegistry(config: ToolRegistryConfig = {}): Tool[] {
  const apiKey = config.apiKey || NVIDIA_API_KEY || "";
  
  const tools: Tool[] = [
    // Core file operations
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new ThinkTool(),
    
    // Memory
    new MemoryTool(),
    new EntityMemoryTool(),
    new UnifiedMemoryTool(),
    
    // Search
    new GoogleSearchTool(),
    new ParallelSearchTool(),
    new LocalDocsSearchTool(),
    
    // GitHub
    new GitHubAnalyzerTool(),
    new GitHubFileReaderTool(),
    
    // Documentation
    new CodeDocumentationTool(apiKey),
    new DocumentationSpecialistTool(apiKey),
    new MermaidGeneratorTool(apiKey),
    new QuickDiagramTool(),
    
    // Reflection
    new ReflectionTool(apiKey),
  ];
  
  // Optional report tools
  if (config.enableReports !== false) {
    tools.push(
      new ExtendReportTool(apiKey),
      new ReportPlannerTool(apiKey),
      new SectionAuthorTool(apiKey),
      new ReportCompilerTool(),
    );
  }
  
  return tools;
}

/**
 * Get tool by name from registry
 */
export function getToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}

/**
 * Tool alias mapping - empty, no aliases needed
 */
export const TOOL_ALIASES: Record<string, { 
  name: string | ((args: Record<string, unknown>) => string); 
  transform?: (args: Record<string, unknown>) => Record<string, unknown>;
}> = {};

/**
 * Resolve tool alias to actual tool name and transform args
 */
export function resolveToolAlias(
  name: string, 
  args: Record<string, unknown>
): { name: string; args: Record<string, unknown> } {
  const alias = TOOL_ALIASES[name];
  if (!alias) return { name, args };
  
  const resolvedName = typeof alias.name === "function" ? alias.name(args) : alias.name;
  const resolvedArgs = alias.transform ? alias.transform(args) : args;
  
  return { name: resolvedName, args: resolvedArgs };
}
