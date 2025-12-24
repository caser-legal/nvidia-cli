/**
 * MCP Agent
 * Agent that uses MCP protocol for tool discovery and execution
 * 
 * This is the production-grade agent that mirrors how Codex CLI works:
 * - Tools are discovered via MCP protocol
 * - Tool execution happens via MCP callTool
 * - Same MCP server serves both Codex CLI and this web app
 */

import OpenAI from "openai";
import type { AgentMessage, AgentConfig, AgentEvent, ToolCall, ToolResult } from "./types";
import { 
  getMCPClient, 
  getMCPToolDefinitions, 
  callMCPTool,
  listMCPTools,
  type OpenAIToolDefinition 
} from "../mcp-client";
import { FlywheelLogger, ToolCallRecord } from "./flywheel";
import { PIIGuard } from "../security/pii-guard";
import { ContextManager, getContextLimits } from "../context-manager";

// Check if using local LLM
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === "true";
const CONTEXT_LIMITS = getContextLimits(USE_LOCAL_LLM);

// Default config optimized for tool calling
const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 0.6,  // NVIDIA recommends 0.6 for tool calling
  topP: 0.95,        // NVIDIA recommends 0.95 for tool calling
  contextWindowTokens: CONTEXT_LIMITS.maxInputTokens,
};

export class MCPAgent {
  private client: OpenAI;
  private config: AgentConfig;
  private messages: AgentMessage[];
  private systemPrompt: string;
  private onEvent?: (event: AgentEvent) => void;
  private flywheelLogger?: FlywheelLogger;
  private toolCallRecords: ToolCallRecord[] = [];
  private mode: string = "chat";
  private piiGuard: PIIGuard;
  private contextManager: ContextManager;
  private abortSignal?: AbortSignal;
  private toolDefinitions: OpenAIToolDefinition[] | null = null;

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;
    systemPrompt: string;
    config?: Partial<AgentConfig>;
    onEvent?: (event: AgentEvent) => void;
    flywheelLogger?: FlywheelLogger;
    mode?: string;
    abortSignal?: AbortSignal;
  }) {
    const useLocalLLM = process.env.USE_LOCAL_LLM === "true";
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://192.168.50.50:11434/v1";
    const apiKey = useLocalLLM ? "ollama" : (options.apiKey || process.env.NVIDIA_API_KEY);
    
    if (!useLocalLLM && !apiKey) {
      throw new Error("NVIDIA_API_KEY is required");
    }
    
    this.client = new OpenAI({
      baseURL: useLocalLLM ? ollamaBaseUrl : (options.baseUrl || "https://integrate.api.nvidia.com/v1"),
      apiKey,
    });

    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.systemPrompt = options.systemPrompt;
    this.messages = [];
    this.onEvent = options.onEvent;
    this.flywheelLogger = options.flywheelLogger;
    this.mode = options.mode || "chat";
    this.abortSignal = options.abortSignal;
    
    // Initialize components
    this.piiGuard = new PIIGuard();
    this.contextManager = new ContextManager(useLocalLLM);
    
    const limits = this.contextManager.getLimits();
    console.log(`[MCPAgent] Context limits: ${limits.maxInputTokens.toLocaleString()} tokens`);
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  /**
   * Initialize MCP connection and discover tools
   */
  private async initializeMCP(): Promise<void> {
    if (this.toolDefinitions) return;
    
    console.log("[MCPAgent] Initializing MCP connection...");
    
    // Connect to MCP server and get tool definitions
    await getMCPClient();
    this.toolDefinitions = await getMCPToolDefinitions();
    
    console.log(`[MCPAgent] Discovered ${this.toolDefinitions.length} tools via MCP`);
    console.log("[MCPAgent] Tools:", this.toolDefinitions.map(t => t.function.name).join(", "));
  }

  /**
   * Parse XML-style tool calls from content (fallback for models that don't use native tool calling)
   */
  private parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    if (!content) return toolCalls;
    
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      const inner = match[1];
      const funcMatch = /<function=([a-zA-Z0-9_]+)>/.exec(inner);
      if (!funcMatch) continue;
      
      const name = funcMatch[1];
      const args: Record<string, unknown> = {};
      const paramRegex = /<parameter=([a-zA-Z0-9_]+)>([\s\S]*?)<\/parameter>/g;
      let paramMatch;
      
      while ((paramMatch = paramRegex.exec(inner)) !== null) {
        args[paramMatch[1]] = paramMatch[2].trim();
      }

      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      });
    }
    
    return toolCalls;
  }

  /**
   * Execute a tool call via MCP
   */
  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsString } = toolCall.function;
    const startTime = Date.now();
    
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      args = { raw: argsString };
    }

    console.log(`[MCPAgent] Executing tool: ${name}`);

    // Handle tool aliases (common hallucinated tool names)
    const aliasMap: Record<string, { name: string; transform?: (a: Record<string, unknown>) => Record<string, unknown> }> = {
      "str_replace_editor": {
        name: args.command === "view" ? "file_read" : "file_write",
        transform: (a) => a.command === "view" 
          ? { operation: "read", path: a.path }
          : { operation: "edit", path: a.path, old_text: a.old_str, new_text: a.new_str },
      },
      "str_replace": {
        name: "file_write",
        transform: (a) => ({ operation: "edit", path: a.path, old_text: a.old_str, new_text: a.new_str }),
      },
      "view": {
        name: "file_read",
        transform: (a) => ({ operation: "read", path: a.path }),
      },
      "create": {
        name: "file_write",
        transform: (a) => ({ operation: "write", path: a.path, content: a.file_text || a.content }),
      },
    };

    let actualName = name;
    let actualArgs = args;
    
    if (aliasMap[name]) {
      const alias = aliasMap[name];
      actualName = typeof alias.name === "string" ? alias.name : name;
      if (alias.transform) {
        actualArgs = alias.transform(args);
      }
      console.log(`[MCPAgent] Redirecting "${name}" to "${actualName}"`);
    }

    // Execute via MCP
    const result = await callMCPTool(actualName, actualArgs);
    const duration = Date.now() - startTime;

    // Record for flywheel
    this.toolCallRecords.push({
      toolName: actualName,
      arguments: actualArgs,
      result: result.content,
      durationMs: duration,
      success: !result.isError,
      error: result.isError ? result.content : undefined,
    });

    return {
      tool_call_id: toolCall.id,
      content: result.content,
      is_error: result.isError,
    };
  }

  /**
   * Main agent loop
   */
  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    const startTime = Date.now();
    this.toolCallRecords = [];
    
    // Initialize MCP connection
    await this.initializeMCP();
    
    // Redact PII
    const sanitizedUserMessage = this.piiGuard.redact(userMessage);
    
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: sanitizedUserMessage });

    // Initialize with conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 100;
    let finalResponse = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (iterations < maxIterations) {
      // Check for abort
      if (this.abortSignal?.aborted) {
        this.emit({ type: "status", status: "completed" });
        return finalResponse || "Request cancelled";
      }
      
      iterations++;

      // Build messages for API
      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        ...this.messages.map((m) => {
          if (m.role === "tool") {
            return {
              role: "tool" as const,
              content: m.content || "",
              tool_call_id: m.tool_call_id || "",
            };
          }
          if (m.role === "assistant" && m.tool_calls) {
            return {
              role: "assistant" as const,
              content: m.content,
              tool_calls: m.tool_calls,
            };
          }
          return {
            role: m.role as "user" | "assistant",
            content: m.content || "",
          };
        }),
      ];

      try {
        // Context management
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          this.toolDefinitions as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
        if (contextCheck.warning) {
          console.log(`[MCPAgent] Context warning: ${contextCheck.warning}`);
        }
        
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;
        
        console.log(`[MCPAgent] Iteration ${iterations}, ${this.toolDefinitions?.length || 0} tools, ${contextCheck.stats.finalTokens} tokens`);

        // Call LLM
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: finalMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: this.toolDefinitions as OpenAI.ChatCompletionTool[],
          tool_choice: this.toolDefinitions && this.toolDefinitions.length > 0 ? "auto" : undefined,
        });

        // Track tokens
        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
        }

        const choice = response.choices[0];
        const message = choice.message;

        // Fallback: Parse XML tool calls if native ones missing
        if (!message.tool_calls && message.content) {
          const parsedTools = this.parseToolCallsFromContent(message.content);
          if (parsedTools.length > 0) {
            message.tool_calls = parsedTools;
          }
        }

        // Add assistant message to history
        const assistantMessage: AgentMessage = {
          role: "assistant",
          content: message.content,
          tool_calls: message.tool_calls as ToolCall[] | undefined,
        };
        this.messages.push(assistantMessage);

        if (message.content) {
          this.emit({ type: "message", role: "assistant", content: message.content });
          finalResponse = message.content;
        }

        // Execute tools if needed
        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`[MCPAgent] Executing ${message.tool_calls.length} tool(s)...`);
          
          for (const tc of message.tool_calls as ToolCall[]) {
            this.emit({ type: "tool_call", name: tc.function.name, args: tc.function.arguments });
            const result = await this.executeToolCall(tc);
            this.emit({ type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error });
            
            this.messages.push({
              role: "tool",
              content: result.content,
              tool_call_id: result.tool_call_id,
            });
          }
          
          continue; // Loop to get next response
        }

        // No tool calls - task complete
        console.log("[MCPAgent] Task completed");
        this.emit({ type: "status", status: "completed" });
        
        // Log to flywheel
        if (this.flywheelLogger) {
          this.flywheelLogger.logInteraction({
            userMessage: sanitizedUserMessage,
            assistantResponse: finalResponse,
            systemPrompt: this.systemPrompt,
            conversationHistory: (conversationHistory || []).map(m => ({ role: m.role, content: m.content || "" })),
            toolCalls: this.toolCallRecords,
            model: this.config.model,
            mode: this.mode,
            tokenUsage: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalPromptTokens + totalCompletionTokens,
            },
            latencyMs: Date.now() - startTime,
          });
        }

        return message.content || "";

      } catch (error) {
        console.error("[MCPAgent] Error:", error);
        throw error;
      }
    }

    this.emit({ type: "error", message: "Max iterations reached" });
    this.emit({ type: "status", status: "error" });
    return "Error: Maximum iterations reached";
  }

  /**
   * Streaming version of run
   */
  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
    // Initialize MCP
    await this.initializeMCP();
    
    const sanitizedUserMessage = this.piiGuard.redact(userMessage);

    yield { type: "status", status: "running" };
    yield { type: "message", role: "user", content: sanitizedUserMessage };

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      if (this.abortSignal?.aborted) return;
      
      iterations++;

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        ...this.messages.map((m) => {
          if (m.role === "tool") {
            return { role: "tool" as const, content: m.content || "", tool_call_id: m.tool_call_id || "" };
          }
          if (m.role === "assistant" && m.tool_calls) {
            return { role: "assistant" as const, content: m.content, tool_calls: m.tool_calls };
          }
          return { role: m.role as "user" | "assistant", content: m.content || "" };
        }),
      ];

      try {
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          this.toolDefinitions as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;

        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: finalMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: this.toolDefinitions as OpenAI.ChatCompletionTool[],
          tool_choice: this.toolDefinitions && this.toolDefinitions.length > 0 ? "auto" : undefined,
          stream: true,
        });

        let content = "";
        let toolCalls: ToolCall[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          
          if (delta?.content) {
            content += delta.content;
            yield { type: "message", role: "assistant", content: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        // Fallback XML parsing
        if (toolCalls.length === 0 && content) {
          const parsedTools = this.parseToolCallsFromContent(content);
          if (parsedTools.length > 0) toolCalls = parsedTools;
        }

        // Add assistant message
        this.messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        // Execute tools
        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            yield { type: "tool_call", name: tc.function.name, args: tc.function.arguments };
            const result = await this.executeToolCall(tc);
            yield { type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error };
            
            this.messages.push({
              role: "tool",
              content: result.content,
              tool_call_id: result.tool_call_id,
            });
          }
          continue;
        }

        yield { type: "status", status: "completed" };
        yield { type: "complete", summary: content };
        return;
        
      } catch (error) {
        throw error;
      }
    }

    yield { type: "error", message: "Max iterations reached" };
    yield { type: "status", status: "error" };
  }

  clearHistory() {
    this.messages = [];
  }

  getHistory(): AgentMessage[] {
    return [...this.messages];
  }
}
