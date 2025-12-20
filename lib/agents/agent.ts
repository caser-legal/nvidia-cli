// Agent Core
// Main agent loop using NVIDIA NIM API with tool execution

import OpenAI from "openai";
import type {
  Tool,
  ToolCall,
  ToolResult,
  AgentMessage,
  AgentConfig,
  AgentEvent,
} from "./types";

const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 1,
  contextWindowTokens: 128000,
};

export class Agent {
  private client: OpenAI;
  private config: AgentConfig;
  private tools: Map<string, Tool>;
  private messages: AgentMessage[];
  private systemPrompt: string;
  private onEvent?: (event: AgentEvent) => void;

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;
    systemPrompt: string;
    tools?: Tool[];
    config?: Partial<AgentConfig>;
    onEvent?: (event: AgentEvent) => void;
  }) {
    const apiKey = options.apiKey || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error("NVIDIA_API_KEY is required. Set it in .env.local or pass it to the Agent constructor.");
    }
    
    this.client = new OpenAI({
      baseURL: options.baseUrl || "https://integrate.api.nvidia.com/v1",
      apiKey,
    });

    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.systemPrompt = options.systemPrompt;
    this.tools = new Map();
    this.messages = [];
    this.onEvent = options.onEvent;

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

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.function.name);
    
    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        content: `Tool '${toolCall.function.name}' not found`,
        is_error: true,
      };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      this.emit({ type: "tool_call", name: tool.name, args: toolCall.function.arguments });
      
      const result = await tool.execute(args);
      this.emit({ type: "tool_result", name: tool.name, result });
      
      return {
        tool_call_id: toolCall.id,
        content: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit({ type: "tool_result", name: tool.name, result: errorMsg, is_error: true });
      
      return {
        tool_call_id: toolCall.id,
        content: `Error executing tool: ${errorMsg}`,
        is_error: true,
      };
    }
  }

  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: userMessage });

    // Initialize with conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    // Add user message
    this.messages.push({ role: "user", content: userMessage });

    let iterations = 0;
    const maxIterations = 50; // Safety limit

    while (iterations < maxIterations) {
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

      // Call NVIDIA NIM API
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: apiMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: this.tools.size > 0 ? this.getToolDefinitions() : undefined,
      });

      const choice = response.choices[0];
      const message = choice.message;

      // Add assistant message to history
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls as ToolCall[] | undefined,
      };
      this.messages.push(assistantMessage);

      if (message.content) {
        this.emit({ type: "message", role: "assistant", content: message.content });
      }

      // Check if we need to execute tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Execute all tool calls
        const results = await Promise.all(
          message.tool_calls.map((tc) => this.executeToolCall(tc as ToolCall))
        );

        // Add tool results to messages
        for (const result of results) {
          this.messages.push({
            role: "tool",
            content: result.content,
            tool_call_id: result.tool_call_id,
          });
        }

        // Continue the loop to get next response
        continue;
      }

      // No tool calls - we're done
      this.emit({ type: "status", status: "completed" });
      return message.content || "";
    }

    this.emit({ type: "error", message: "Max iterations reached" });
    this.emit({ type: "status", status: "error" });
    return "Error: Maximum iterations reached";
  }

  // Stream version for real-time updates
  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
    this.emit({ type: "status", status: "running" });
    yield { type: "status", status: "running" };
    yield { type: "message", role: "user", content: userMessage };

    this.messages.push({ role: "user", content: userMessage });

    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      iterations++;

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

      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: apiMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: this.tools.size > 0 ? this.getToolDefinitions() : undefined,
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
                toolCalls[tc.index] = {
                  id: tc.id || "",
                  type: "function",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      // Add assistant message
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      this.messages.push(assistantMessage);

      // Execute tools if needed
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
