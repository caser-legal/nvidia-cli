#!/usr/bin/env npx tsx
/**
 * NVIDIA CLI MCP Server - WORKING VERSION
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("[MCP] Uncaught exception:", err.message);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[MCP] Unhandled rejection:", reason);
  process.exit(1);
});

console.error("[nvidia-cli MCP] Starting server...");

const server = new McpServer({ name: "nvidia-cli", version: "2.1.0" });

// Use hardcoded API key
const apiKey = "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";

// Import essential tools
import { BashTool } from "./lib/agents/tools/bash.ts";
import { FileReadTool } from "./lib/agents/tools/file-read.ts";
import { FileWriteTool } from "./lib/agents/tools/file-write.ts";
import { SetProjectTool, GetProjectTool } from "./lib/agents/tools/project.ts";
import { ThinkTool } from "./lib/agents/tools/think.ts";
import { MemoryTool, EntityMemoryTool } from "./lib/agents/tools/memory.ts";
import { UnifiedMemoryTool } from "./lib/agents/tools/unified-memory.ts";
import { PerplexitySearchTool } from "./lib/agents/tools/perplexity-search.ts";

// Instantiate tools
const bashTool = new BashTool();
const fileReadTool = new FileReadTool();
const fileWriteTool = new FileWriteTool();
const setProjectTool = new SetProjectTool();
const getProjectTool = new GetProjectTool();
const thinkTool = new ThinkTool();
const memoryTool = new MemoryTool();
const entityMemoryTool = new EntityMemoryTool();
const unifiedMemoryTool = new UnifiedMemoryTool();
const googleSearchTool = new PerplexitySearchTool();

// Register essential tools
server.tool(
  "bash",
  "Execute shell commands",
  {
    command: z.string().describe("Shell command to execute"),
  },
  async ({ command }) => {
    const result = await bashTool.execute({ command });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "file_read",
  "Read files or list directories",
  {
    operation: z.enum(["read", "list"]).describe("Operation to perform"),
    path: z.string().describe("File or directory path"),
  },
  async ({ operation, path }) => {
    const result = await fileReadTool.execute({ operation, path });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "file_write",
  "Write content to a file",
  {
    operation: z.enum(["write", "append"]).describe("Write operation"),
    path: z.string().describe("File path"),
    content: z.string().describe("Content to write"),
  },
  async ({ operation, path, content }) => {
    const result = await fileWriteTool.execute({ operation, path, content });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "set_project",
  "Set the current working directory",
  {
    path: z.string().describe("Directory path to set as current project"),
  },
  async ({ path }) => {
    const result = await setProjectTool.execute({ path });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "get_project",
  "Get the current working directory",
  {},
  async () => {
    const result = await getProjectTool.execute({});
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "think",
  "Internal reasoning step",
  {
    thought: z.string().describe("Reasoning or thought process"),
  },
  async ({ thought }) => {
    const result = await thinkTool.execute({ thought });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "memory",
  "Store and retrieve information semantically",
  {
    operation: z.enum(["remember", "recall"]).describe("Memory operation"),
    content: z.string().optional().describe("Content to remember (for remember operation)"),
    query: z.string().optional().describe("Query to search for (for recall operation)"),
  },
  async ({ operation, content, query }) => {
    const result = await memoryTool.execute({ operation, content, query });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "entity_memory",
  "Track entities like people, projects, companies",
  {
    operation: z.enum(["remember", "recall"]).describe("Memory operation"),
    entity_type: z.string().optional().describe("Type of entity (person, project, company)"),
    entity_name: z.string().optional().describe("Name of the entity"),
    content: z.string().optional().describe("Information about the entity"),
    query: z.string().optional().describe("Query to search for"),
  },
  async ({ operation, entity_type, entity_name, content, query }) => {
    const result = await entityMemoryTool.execute({ operation, entity_type, entity_name, content, query });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "unified_memory",
  "Unified memory interface",
  {
    operation: z.enum(["remember", "recall", "clear"]).describe("Memory operation"),
    content: z.string().optional().describe("Content to remember"),
    query: z.string().optional().describe("Query to search for"),
  },
  async ({ operation, content, query }) => {
    const result = await unifiedMemoryTool.execute({ operation, content, query });
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "google_search",
  "Search the web using Google Custom Search",
  {
    query: z.string().describe("Search query"),
    num_results: z.number().optional().describe("Number of results to return (default: 5)"),
  },
  async ({ query, num_results }) => {
    const result = await googleSearchTool.execute({ query, num_results });
    return { content: [{ type: "text", text: result }] };
  }
);

async function main() {
  console.error("[nvidia-cli MCP] Connecting to stdio transport...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[nvidia-cli MCP] Server started successfully");
}

main().catch((error) => {
  console.error("[nvidia-cli MCP] Fatal error:", error);
  process.exit(1);
});
