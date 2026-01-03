// Agents Module Index
// Export all agent framework components

export { BaseTool } from "./base-tool";
export { Agent } from "./agent";
export { SimpleAgent } from "./simple-agent";
export { FileReadTool } from "./tools/file-read";
export { FileWriteTool } from "./tools/file-write";
export { BashTool } from "./tools/bash";
export { ThinkTool } from "./tools/think";
export { PerplexitySearchTool, PerplexityAskTool } from "./tools/perplexity-search";
export { LocalDocsSearchTool } from "./tools/local-docs-search";
export { GitHubAnalyzerTool, GitHubFileReaderTool } from "./tools/github-analyzer";
export { MermaidGeneratorTool, QuickDiagramTool } from "./tools/mermaid-generator";
export { MemoryTool, EntityMemoryTool } from "./tools/memory";
export { UnifiedMemoryTool } from "./tools/unified-memory";
export { getUnifiedMemory, getVectorMemory, VectorMemoryStore } from "./memory";
export { CodeDocumentationTool, DocumentationSpecialistTool } from "./tools/code-documentation";
export { RAGTools, RAGIngestTool, RAGSearchTool, RAGQueryTool, RAGResearchTool, RAGStatsTool, RAGClearTool } from "./tools/rag-tools";
export { MCPAgent } from "./mcp-agent";
export { createToolRegistry, getAllToolNames, resolveToolAlias } from "./tools/registry";

// Hooks
export { executeAgentSpawnHooks, executePostToolUseHooks, executeStopHooks, resetHooksCache } from "./hooks";

// Unified Context
export { UnifiedContext, createUnifiedContext } from "./unified-context";

// Tool Orchestrator
export { ToolOrchestrator } from "./tool-orchestrator";

// Feedback Optimizer
export { FeedbackOptimizer } from "./feedback-optimizer";

// Agent Runner
export { runDoryAgent, resetAgentRunner, getRunnerStats } from "./mcp-agent-runner";

export * from "./types";
export * from "./flywheel";
export * from "./rag";
