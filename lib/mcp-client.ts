/**
 * MCP Client for NVIDIA CLI Web App
 * Connects to the MCP server and provides tool discovery + execution
 * 
 * This replaces direct tool instantiation with MCP protocol communication,
 * giving the web app the same tool access as Codex CLI.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";

// OpenAI-compatible tool definition format
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

// Tool execution result
export interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

// MCP Client singleton
let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let toolCache: MCPTool[] | null = null;
let connectionPromise: Promise<Client> | null = null;

// Path to MCP server
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || "/Users/home/Documents/nvidia-cli/mcp-server.ts";
const MCP_SERVER_CWD = process.env.MCP_SERVER_CWD || "/Users/home/Documents/nvidia-cli";

/**
 * Get or create MCP client connection
 * Uses singleton pattern - all callers await the same promise
 */
export async function getMCPClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  
  if (!connectionPromise) {
    connectionPromise = connectMCPClient().then(client => {
      mcpClient = client;
      return client;
    }).catch(err => {
      connectionPromise = null; // Allow retry on failure
      throw err;
    });
  }
  
  return connectionPromise;
}

/**
 * Internal: Create new MCP client connection
 */
async function connectMCPClient(): Promise<Client> {
  console.log("[MCP Client] Connecting to MCP server...");
  console.log("[MCP Client] Server path:", MCP_SERVER_PATH);
  console.log("[MCP Client] Working directory:", MCP_SERVER_CWD);

  // Create stdio transport to spawn MCP server
  mcpTransport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", MCP_SERVER_PATH],
    cwd: MCP_SERVER_CWD,
    env: {
      ...process.env,
      // Pass through necessary env vars
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || "",
      NGC_API_KEY: process.env.NGC_API_KEY || "",
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
      GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || "",
    },
  });

  // Create client
  const client = new Client({
    name: "nvidia-cli-web",
    version: "1.0.0",
  });

  // Connect with retry
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.connect(mcpTransport);
      console.log("[MCP Client] Connected successfully");
      break;
    } catch (err) {
      console.error(`[MCP Client] Connection attempt ${attempt}/${maxRetries} failed:`, err);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  // Clear tool cache on new connection
  toolCache = null;

  return client;
}

/**
 * Disconnect MCP client
 */
export async function disconnectMCPClient(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (e) {
      console.error("[MCP Client] Error closing client:", e);
    }
    mcpClient = null;
  }
  
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch (e) {
      console.error("[MCP Client] Error closing transport:", e);
    }
    mcpTransport = null;
  }
  
  toolCache = null;
  connectionPromise = null;
  console.log("[MCP Client] Disconnected");
}

/**
 * List all available tools from MCP server
 * Results are cached for performance
 */
export async function listMCPTools(): Promise<MCPTool[]> {
  // Return cached tools if available
  if (toolCache) {
    return toolCache;
  }

  const client = await getMCPClient();
  const result = await client.listTools();
  
  toolCache = result.tools;
  console.log(`[MCP Client] Discovered ${toolCache.length} tools`);
  
  return toolCache;
}

/**
 * Convert MCP tools to OpenAI-compatible tool definitions
 * This allows the Agent to use MCP tools with the OpenAI API format
 */
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

/**
 * Execute a tool via MCP
 */
export async function callMCPTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const client = await getMCPClient();
  const startTime = Date.now();
  
  console.log(`[MCP Client] Calling tool: ${name}`);
  console.log(`[MCP Client] Arguments:`, JSON.stringify(args, null, 2));

  try {
    const result = await client.callTool({
      name,
      arguments: args,
    });

    const duration = Date.now() - startTime;
    console.log(`[MCP Client] Tool ${name} completed in ${duration}ms`);

    // Extract text content from result
    let content = "";
    let isError = false;

    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === "text") {
          content += item.text;
        }
      }
    }

    // Check if result indicates error
    if (result.isError) {
      isError = true;
    }

    return { content, isError };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[MCP Client] Tool ${name} failed after ${duration}ms:`, error);
    
    return {
      content: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

/**
 * Check if MCP client is connected
 */
export function isMCPConnected(): boolean {
  return mcpClient !== null;
}

/**
 * Get tool by name from cache
 */
export async function getMCPTool(name: string): Promise<MCPTool | undefined> {
  const tools = await listMCPTools();
  return tools.find((t) => t.name === name);
}

/**
 * Refresh tool cache (force re-discovery)
 */
export async function refreshMCPTools(): Promise<MCPTool[]> {
  toolCache = null;
  return listMCPTools();
}

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("beforeExit", async () => {
    await disconnectMCPClient();
  });
  
  process.on("SIGINT", async () => {
    await disconnectMCPClient();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    await disconnectMCPClient();
    process.exit(0);
  });
}
