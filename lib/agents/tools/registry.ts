/**
 * Tool Registry - Single source of truth for all tools
 * FIXED: Includes ALL tools
 */

import { Tool } from "../types";
import { FileReadTool } from "./file-read";
import { FileWriteTool } from "./file-write";
import { NVIDIA_API_KEY } from "../../api-key";
import { BashTool } from "./bash";
import { ThinkTool } from "./think";
import { SetProjectTool, GetProjectTool } from "./project";
import { PerplexitySearchTool } from "./perplexity-search";
import { LocalDocsSearchTool } from "./local-docs-search";
import { MemoryTool, EntityMemoryTool } from "./memory";
import { UnifiedMemoryTool } from "./unified-memory";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./github-analyzer";
import { MermaidGeneratorTool, QuickDiagramTool } from "./mermaid-generator";
import { CodeDocumentationTool, DocumentationSpecialistTool } from "./code-documentation";
import { ReflectionTool, ExtendReportTool } from "./reflection";
import { ReportPlannerTool, SectionAuthorTool, ReportCompilerTool } from "./report-planner";
import { VisionAnalysisTool, iOSUIReviewTool, MockupComparisonTool } from "./vision-analysis";
import {
  RAGIngestTool,
  RAGSearchTool,
  RAGQueryTool,
  RAGResearchTool,
  RAGStatsTool,
  RAGClearTool,
  RAGValidateTool,
  RAGUpdateTool,
} from "./rag-tools";
import {
  SearchSpecialistTool,
  ReportWriterTool,
  QualityReviewerTool,
  ReportExtenderTool,
  SourceDeduplicatorTool,
} from "./specialist-agents";

export interface ToolRegistryConfig {
  apiKey?: string;
}

/**
 * Create ALL tools with consistent configuration
 */
export function createToolRegistry(config: ToolRegistryConfig = {}): Tool[] {
  const apiKey = config.apiKey || NVIDIA_API_KEY || "";
  
  return [
    // Core file operations
    new SetProjectTool(),
    new GetProjectTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new BashTool(),
    new ThinkTool(),
    
    // Memory - ALL memory tools
    new MemoryTool(),
    new EntityMemoryTool(),
    new UnifiedMemoryTool(),
    
    // Search
    new PerplexitySearchTool(),
    new LocalDocsSearchTool(),
    
    // GitHub
    new GitHubAnalyzerTool(),
    new GitHubFileReaderTool(),
    
    // Documentation
    new CodeDocumentationTool(apiKey),
    new DocumentationSpecialistTool(apiKey),
    new MermaidGeneratorTool(apiKey),
    new QuickDiagramTool(),
    
    // Reflection & Reports
    new ReflectionTool(apiKey),
    new ExtendReportTool(apiKey),
    new ReportPlannerTool(apiKey),
    new SectionAuthorTool(apiKey),
    new ReportCompilerTool(),
    
    // Vision - ALL vision tools
    new VisionAnalysisTool(),
    new iOSUIReviewTool(),
    new MockupComparisonTool(),
    
    // RAG - ALL RAG tools (these are static instances)
    RAGIngestTool,
    RAGSearchTool,
    RAGQueryTool,
    RAGResearchTool,
    RAGStatsTool,
    RAGClearTool,
    RAGValidateTool,
    RAGUpdateTool,
    
    // Specialist agents
    new SearchSpecialistTool(apiKey),
    new ReportWriterTool(apiKey),
    new QualityReviewerTool(apiKey),
    new ReportExtenderTool(apiKey),
    new SourceDeduplicatorTool(),
  ];
}

/**
 * Get tool by name from registry
 */
export function getToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}

/**
 * Tool alias mapping
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

/**
 * Get all tool names
 */
export function getAllToolNames(config: ToolRegistryConfig = {}): string[] {
  return createToolRegistry(config).map(t => t.name);
}
