/**
 * MCP Agent
 * Agent that uses MCP protocol for tool discovery and execution
 */

import OpenAI from "openai";
import type { AgentMessage, AgentConfig, AgentEvent, ToolCall, ToolResult } from "./types";
import { getMCPClient, getMCPToolDefinitions, callMCPTool, type OpenAIToolDefinition } from "../mcp-client";
import { NVIDIA_API_KEY } from "../api-key";
import { FlywheelLogger, ToolCallRecord } from "./flywheel";
import { PIIGuard } from "../security/pii-guard";
import { ContextManager, getContextLimits } from "../context-manager";
import { createLogger } from "../logger";

const log = createLogger("MCPAgent");

const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === "true";
const CONTEXT_LIMITS = getContextLimits(USE_LOCAL_LLM);

const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 0.6,
  topP: 0.95,
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
    const apiKey = useLocalLLM ? "ollama" : (options.apiKey || NVIDIA_API_KEY);
    
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
    
    this.piiGuard = new PIIGuard();
    this.contextManager = new ContextManager(useLocalLLM);
    
    const limits = this.contextManager.getLimits();
    log.info(`Context limits: ${limits.maxInputTokens.toLocaleString()} tokens`);
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  private async initializeMCP(): Promise<void> {
    if (this.toolDefinitions) return;
    
    log.info("Initializing MCP connection");
    await getMCPClient();
    this.toolDefinitions = await getMCPToolDefinitions();
    log.info(`Discovered ${this.toolDefinitions.length} tools via MCP`, { tools: this.toolDefinitions.map(t => t.function.name) });
  }

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

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsString } = toolCall.function;
    const startTime = Date.now();
    
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      args = { raw: argsString };
    }

    log.debug(`Executing tool: ${name}`);

    const actualName = name;
    const actualArgs = args;
    }

    const result = await callMCPTool(actualName, actualArgs);
    const duration = Date.now() - startTime;

    this.toolCallRecords.push({
      toolName: actualName,
      arguments: actualArgs,
      result: result.content,
      durationMs: duration,
      success: !result.isError,
      error: result.isError ? result.content : undefined,
    });

    return { tool_call_id: toolCall.id, content: result.content, is_error: result.isError };
  }

  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    const startTime = Date.now();
    this.toolCallRecords = [];
    
    await this.initializeMCP();
    
    const sanitizedUserMessage = this.piiGuard.redact(userMessage);
    
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: sanitizedUserMessage });

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
      if (this.abortSignal?.aborted) {
        this.emit({ type: "status", status: "completed" });
        return finalResponse || "Request cancelled";
      }
      
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
        
        if (contextCheck.warning) log.warn(contextCheck.warning);
        
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;
        
        log.debug(`Iteration ${iterations}`, { tools: this.toolDefinitions?.length || 0, tokens: contextCheck.stats.finalTokens });

        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: finalMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: this.toolDefinitions as OpenAI.ChatCompletionTool[],
          tool_choice: this.toolDefinitions && this.toolDefinitions.length > 0 ? "auto" : undefined,
        });

        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
        }

        const choice = response.choices[0];
        const message = choice.message;

        if (!message.tool_calls && message.content) {
          const parsedTools = this.parseToolCallsFromContent(message.content);
          if (parsedTools.length > 0) message.tool_calls = parsedTools;
        }

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

        if (message.tool_calls && message.tool_calls.length > 0) {
          log.debug(`Executing ${message.tool_calls.length} tool(s)`);
          
          for (const tc of message.tool_calls as ToolCall[]) {
            this.emit({ type: "tool_call", name: tc.function.name, args: tc.function.arguments });
            const result = await this.executeToolCall(tc);
            this.emit({ type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error });
            
            this.messages.push({ role: "tool", content: result.content, tool_call_id: result.tool_call_id });
          }
          
          continue;
        }

        // Check if user requested edits but none were made
        const madeEdits = this.toolCallRecords.some(r => r.toolName === 'file_write' && r.success);
        const userRequestedEdits = /\b(edit|fix|implement|create|build|redesign|update|change|modify|add|remove|refactor|install)\b/i.test(sanitizedUserMessage);
        
        if (userRequestedEdits && !madeEdits && iterations < 10) {
          log.debug("User requested edits but none made - nudging");
          this.messages.push({
            role: "user",
            content: "You have not made any code changes yet. The user requested edits/changes. Use file_write to implement the requested changes NOW. Do not just summarize - EDIT the files.",
          });
          continue;
        }

        log.info("Task completed");
        this.emit({ type: "status", status: "completed" });
        
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
        log.error("Error in agent loop", { error: String(error) });
        throw error;
      }
    }

    this.emit({ type: "error", message: "Max iterations reached" });
    this.emit({ type: "status", status: "error" });
    return "Error: Maximum iterations reached";
  }

  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
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

        if (toolCalls.length === 0 && content) {
          const parsedTools = this.parseToolCallsFromContent(content);
          if (parsedTools.length > 0) toolCalls = parsedTools;
        }

        this.messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            yield { type: "tool_call", name: tc.function.name, args: tc.function.arguments };
            const result = await this.executeToolCall(tc);
            yield { type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error };
            
            this.messages.push({ role: "tool", content: result.content, tool_call_id: result.tool_call_id });
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
