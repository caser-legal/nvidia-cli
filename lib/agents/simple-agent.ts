// Simple Agent - Lightweight version without mandatory orchestration
// Use this for simple tool-based tasks that don't need full pipeline

import { NVIDIA_API_KEY } from "../api-key";
import OpenAI from "openai";
import type { Tool, ToolCall, ToolResult, AgentMessage, AgentConfig, AgentEvent } from "./types";
import { createLogger } from "../logger";

const log = createLogger("SimpleAgent");

const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 0.6,
  topP: 0.95,
  contextWindowTokens: 262144,
};

export class SimpleAgent {
  private client: OpenAI;
  private config: AgentConfig;
  private tools: Map<string, Tool>;
  private messages: AgentMessage[];
  private systemPrompt: string;
  private onEvent?: (event: AgentEvent) => void;
  private abortSignal?: AbortSignal;

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;
    systemPrompt: string;
    tools?: Tool[];
    config?: Partial<AgentConfig>;
    onEvent?: (event: AgentEvent) => void;
    abortSignal?: AbortSignal;
  }) {
    const useLocalLLM = "false" === "true";
    const ollamaBaseUrl = "http://localhost:11434" || "http://192.168.50.50:11434/v1";
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
    this.tools = new Map();
    this.messages = [];
    this.onEvent = options.onEvent;
    this.abortSignal = options.abortSignal;

    for (const tool of options.tools || []) {
      this.tools.set(tool.name, tool);
    }
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  private getToolDefinitions() {
    return Array.from(this.tools.values()).map((t) => t.toDefinition());
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

  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: userMessage });

    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    this.messages.push({ role: "user", content: userMessage });

    let iterations = 0;
    const maxIterations = 50;
    let finalResponse = "";

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
        const toolDefs = this.tools.size > 0 ? this.getToolDefinitions() : undefined;

        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: apiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: toolDefs,
          tool_choice: toolDefs && toolDefs.length > 0 ? "auto" : undefined,
        });

        const choice = response.choices[0];
        const message = choice.message;

        if (!message.tool_calls && message.content) {
          const parsedTools = this.parseToolCallsFromContent(message.content);
          if (parsedTools.length > 0) {
            message.tool_calls = parsedTools;
          }
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
          const results: ToolResult[] = [];
          for (const tc of message.tool_calls as ToolCall[]) {
            this.emit({ type: "tool_call", name: tc.function.name, args: tc.function.arguments });
            const result = await this.executeToolCall(tc);
            this.emit({ type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error });
            results.push(result);
          }

          for (const result of results) {
            this.messages.push({ role: "tool", content: result.content, tool_call_id: result.tool_call_id });
          }
          continue;
        }

        this.emit({ type: "status", status: "completed" });
        return message.content || "";

      } catch (error) {
        log.error("SimpleAgent error", { error: String(error) });
        throw error;
      }
    }

    this.emit({ type: "error", message: "Max iterations reached" });
    this.emit({ type: "status", status: "error" });
    return "Error: Maximum iterations reached";
  }

  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
    yield { type: "status", status: "running" };
    yield { type: "message", role: "user", content: userMessage };

    this.messages.push({ role: "user", content: userMessage });

    let iterations = 0;
    const maxIterations = 50;

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
        const toolDefs = this.tools.size > 0 ? this.getToolDefinitions() : undefined;

        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: apiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: toolDefs,
          tool_choice: toolDefs && toolDefs.length > 0 ? "auto" : undefined,
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

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsString } = toolCall.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      args = { raw: argsString };
    }
    
    const tool = this.tools.get(name);

    if (!tool) {
      return { tool_call_id: toolCall.id, content: `Tool ${name} not found`, is_error: true };
    }

    try {
      const content = await tool.execute(args);
      return { tool_call_id: toolCall.id, content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { tool_call_id: toolCall.id, content: `Error: ${errorMessage}`, is_error: true };
    }
  }

  clearHistory() {
    this.messages = [];
  }

  getHistory(): AgentMessage[] {
    return [...this.messages];
  }
}
