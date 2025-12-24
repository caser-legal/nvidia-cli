/**
 * MCP Client for NVIDIA CLI Web App
 * Connects to the MCP server and provides tool discovery + execution
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import config from "./config";
import { createLogger } from "./logger";

const log = createLogger("MCP");

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let toolCache: MCPTool[] | null = null;
let connectionPromise: Promise<Client> | null = null;

const MCP_SERVER_PATH = config.mcp.serverPath;
const MCP_SERVER_CWD = config.mcp.serverCwd;

export async function getMCPClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  
  if (!connectionPromise) {
    connectionPromise = connectMCPClient().then(client => {
      mcpClient = client;
      return client;
    }).catch(err => {
      connectionPromise = null;
      throw err;
    });
  }
  
  return connectionPromise;
}

async function connectMCPClient(): Promise<Client> {
  log.info("Connecting to MCP server", { path: MCP_SERVER_PATH, cwd: MCP_SERVER_CWD });

  mcpTransport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", MCP_SERVER_PATH],
    cwd: MCP_SERVER_CWD,
    env: {
      ...process.env,
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || "",
      NGC_API_KEY: process.env.NGC_API_KEY || "",
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
      GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || "",
    },
  });

  const client = new Client({ name: "nvidia-cli-web", version: "1.0.0" });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.connect(mcpTransport);
      log.info("Connected successfully");
      break;
    } catch (err) {
      log.error(`Connection attempt ${attempt}/${maxRetries} failed`, { error: String(err) });
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  toolCache = null;
  return client;
}

export async function disconnectMCPClient(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (e) {
      log.error("Error closing client", { error: String(e) });
    }
    mcpClient = null;
  }
  
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch (e) {
      log.error("Error closing transport", { error: String(e) });
    }
    mcpTransport = null;
  }
  
  toolCache = null;
  connectionPromise = null;
  log.info("Disconnected");
}

export async function listMCPTools(): Promise<MCPTool[]> {
  if (toolCache) return toolCache;

  const client = await getMCPClient();
  const result = await client.listTools();
  
  toolCache = result.tools;
  log.info(`Discovered ${toolCache.length} tools`);
  
  return toolCache;
}

export async function getMCPToolDefinitions(): Promise<OpenAIToolDefinition[]> {
  const mcpTools = await listMCPTools();
  
  return mcpTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: {
        type: "object" as const,
        properties: (tool.inputSchema as { properties?: Record<string, unknown> })?.properties || {},
        required: (tool.inputSchema as { required?: string[] })?.required || [],
      },
    },
  }));
}

export async function callMCPTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const client = await getMCPClient();
  const startTime = Date.now();
  
  log.debug(`Calling tool: ${name}`, { args });

  try {
    const result = await client.callTool({ name, arguments: args });
    const duration = Date.now() - startTime;
    log.debug(`Tool ${name} completed in ${duration}ms`);

    let content = "";
    let isError = false;

    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === "text") content += item.text;
      }
    }

    if (result.isError) isError = true;

    return { content, isError };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`Tool ${name} failed after ${duration}ms`, { error: String(error) });
    
    return {
      content: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

export function isMCPConnected(): boolean {
  return mcpClient !== null;
}

export async function getMCPTool(name: string): Promise<MCPTool | undefined> {
  const tools = await listMCPTools();
  return tools.find((t) => t.name === name);
}

export async function refreshMCPTools(): Promise<MCPTool[]> {
  toolCache = null;
  return listMCPTools();
}

if (typeof process !== "undefined") {
  process.on("beforeExit", async () => { await disconnectMCPClient(); });
  process.on("SIGINT", async () => { await disconnectMCPClient(); process.exit(0); });
  process.on("SIGTERM", async () => { await disconnectMCPClient(); process.exit(0); });
  process.on("uncaughtException", async (err) => {
    log.error("Uncaught exception, cleaning up", { error: String(err) });
    await disconnectMCPClient();
    process.exit(1);
  });
  process.on("unhandledRejection", async (reason) => {
    log.error("Unhandled rejection, cleaning up", { reason: String(reason) });
    await disconnectMCPClient();
    process.exit(1);
  });
}
