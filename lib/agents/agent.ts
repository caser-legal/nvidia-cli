// Agent Core
// Main agent loop using NVIDIA NIM API with tool execution
// Integrated with Data Flywheel for continuous model improvement

import OpenAI from "openai";
import type {
  Tool,
  ToolCall,
  ToolResult,
  AgentMessage,
  AgentConfig,
  AgentEvent,
} from "./types";
import { FlywheelLogger, ToolCallRecord } from "./flywheel";
import { UnifiedContext } from "./unified-context";
import { PIIGuard } from "../security/pii-guard";
import { ToolGuard } from "../security/tool-guard";
import { Tracer, globalTracer } from "./observability/tracer";
import { ToolOrchestrator } from "./tool-orchestrator";
import { FeedbackOptimizer } from "./feedback-optimizer";
import { AutoRAGUpdater } from "./rag/auto-updater";

const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 1.0,
  topP: 1.0,
  contextWindowTokens: 128000,
};

export class Agent {
  private client: OpenAI;
  private config: AgentConfig;
  private tools: Map<string, Tool>;
  private messages: AgentMessage[];
  private systemPrompt: string;
  private onEvent?: (event: AgentEvent) => void;
  private flywheelLogger?: FlywheelLogger;
  private toolCallRecords: ToolCallRecord[] = [];
  private mode: string = "chat";
  private unifiedContext?: UnifiedContext;
  private piiGuard: PIIGuard;
  private toolGuard: ToolGuard;
  private tracer: Tracer;
  private toolOrchestrator?: ToolOrchestrator;
  private feedbackOptimizer?: FeedbackOptimizer;
  private autoRAGUpdater?: AutoRAGUpdater;

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;
    systemPrompt: string;
    tools?: Tool[];
    config?: Partial<AgentConfig>;
    onEvent?: (event: AgentEvent) => void;
    flywheelLogger?: FlywheelLogger;
    mode?: string;
    unifiedContext?: UnifiedContext;
    toolOrchestrator?: ToolOrchestrator;
    feedbackOptimizer?: FeedbackOptimizer;
    autoRAGUpdater?: AutoRAGUpdater;
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
    this.unifiedContext = options.unifiedContext;
    this.toolOrchestrator = options.toolOrchestrator;
    this.feedbackOptimizer = options.feedbackOptimizer;
    this.autoRAGUpdater = options.autoRAGUpdater;
    
    // Initialize Security & Observability
    this.piiGuard = new PIIGuard();
    this.toolGuard = new ToolGuard();
    this.tracer = globalTracer;

    for (const tool of options.tools || []) {
      this.tools.set(tool.name, tool);
    }
    
    // Initialize flywheel logging
    this.flywheelLogger = options.flywheelLogger;
    this.mode = options.mode || "chat";
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  private parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    // Regex to capture <tool_call> ... </tool_call>
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      const inner = match[1];
      // Extract function name
      const funcMatch = /<function=([a-zA-Z0-9_]+)>/.exec(inner);
      if (!funcMatch) continue;
      const name = funcMatch[1];

      // Extract parameters
      const args: Record<string, any> = {};
      const paramRegex = /<parameter=([a-zA-Z0-9_]+)>([\s\S]*?)<\/parameter>/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(inner)) !== null) {
        const key = paramMatch[1];
        const value = paramMatch[2].trim();
        args[key] = value;
      }

      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      });
    }
    return toolCalls;
  }

  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    const runSpanId = this.tracer.startSpan("agent_run", { mode: this.mode });
    const startTime = Date.now();
    this.toolCallRecords = []; // Reset for this run
    
    // Redact PII from incoming message
    const sanitizedUserMessage = this.piiGuard.redact(userMessage);
    
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: sanitizedUserMessage });

    // Retrieve Unified Context
    let contextPrompt = "";
    if (this.unifiedContext) {
      try {
        const contextSpanId = this.tracer.startSpan("context_retrieval");
        const contextResult = await this.unifiedContext.retrieve({ query: sanitizedUserMessage });
        this.tracer.endSpan(contextSpanId);
        
        if (contextResult.formattedContext) {
          contextPrompt = `\n\n### Additional Context\n${contextResult.formattedContext}`;
          this.emit({ type: "message", role: "system", content: `Context retrieved: ${contextResult.ragDocuments.length} docs, ${contextResult.shortTermMemories.length} memories.` });
        }
      } catch (error) {
        console.error("Failed to retrieve unified context:", error);
      }
    }

    // Dynamic Tool Selection
    let activeToolNames: string[] | undefined;
    if (this.toolOrchestrator) {
      try {
        const spanId = this.tracer.startSpan("tool_selection");
        activeToolNames = await this.toolOrchestrator.selectTools(sanitizedUserMessage);
        this.tracer.endSpan(spanId, { selected: activeToolNames });
        this.emit({ type: "status", status: "thinking", message: `Selected tools: ${activeToolNames.join(", ")}` });
      } catch (e) {
        console.error("Tool selection failed:", e);
      }
    }

    // Initialize with conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    // Add user message
    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 50; // Safety limit
    let finalResponse = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (iterations < maxIterations) {
      iterations++;
      const iterSpanId = this.tracer.startSpan(`iteration_${iterations}`);

      // Build messages for API
      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt + contextPrompt },
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
        // Call NVIDIA NIM API
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: apiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: this.tools.size > 0 ? this.getToolDefinitions(activeToolNames) : undefined,
        });

        // Track token usage
        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
        }

        const choice = response.choices[0];
        const message = choice.message;

        // Fallback: Check for XML tool calls if native ones are missing
        if (!message.tool_calls && message.content) {
          const parsedTools = this.parseToolCallsFromContent(message.content);
          if (parsedTools.length > 0) {
            message.tool_calls = parsedTools;
            // Ideally we strip the XML from content, or keep it as log. 
            // We'll keep it but the tool execution loop will handle the calls.
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
          
          this.tracer.endSpan(iterSpanId);
          // Continue the loop to get next response
          continue;
        }

        // No tool calls - we're done
        this.tracer.endSpan(iterSpanId);
        this.emit({ type: "status", status: "completed" });
        
        // Log to flywheel
        if (this.flywheelLogger) {
          const historyForLog = (conversationHistory || []).map(m => ({
            role: m.role,
            content: m.content || "",
          }));
          
          this.flywheelLogger.logInteraction({
            userMessage: sanitizedUserMessage,
            assistantResponse: finalResponse,
            systemPrompt: this.systemPrompt,
            conversationHistory: historyForLog,
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
        
        // Trigger learning loop
        await this.learn();

        this.tracer.endSpan(runSpanId, { status: "completed" });
        return message.content || "";

      } catch (error) {
        this.tracer.failSpan(iterSpanId, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }

    this.tracer.failSpan(runSpanId, new Error("Max iterations reached"));
    this.emit({ type: "error", message: "Max iterations reached" });
    this.emit({ type: "status", status: "error" });
    return "Error: Maximum iterations reached";
  }

  // Stream version for real-time updates
  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
    const runSpanId = this.tracer.startSpan("agent_run_stream", { mode: this.mode });
    
    // Redact PII
    const sanitizedUserMessage = this.piiGuard.redact(userMessage);

    this.emit({ type: "status", status: "running" });
    yield { type: "status", status: "running" };
    yield { type: "message", role: "user", content: sanitizedUserMessage };

    // Retrieve Unified Context
    let contextPrompt = "";
    if (this.unifiedContext) {
      try {
        const contextSpanId = this.tracer.startSpan("context_retrieval");
        const contextResult = await this.unifiedContext.retrieve({ query: sanitizedUserMessage });
        this.tracer.endSpan(contextSpanId);

        if (contextResult.formattedContext) {
          contextPrompt = `\n\n### Additional Context\n${contextResult.formattedContext}`;
          yield { type: "message", role: "system", content: `Context retrieved: ${contextResult.ragDocuments.length} docs, ${contextResult.shortTermMemories.length} memories.` };
        }
      } catch (error) {
        console.error("Failed to retrieve unified context:", error);
      }
    }

    // Dynamic Tool Selection
    let activeToolNames: string[] | undefined;
    if (this.toolOrchestrator) {
      try {
        const spanId = this.tracer.startSpan("tool_selection");
        activeToolNames = await this.toolOrchestrator.selectTools(sanitizedUserMessage);
        this.tracer.endSpan(spanId, { selected: activeToolNames });
        yield { type: "status", status: "thinking", message: `Selected tools: ${activeToolNames.join(", ")}` };
      } catch (e) {
        console.error("Tool selection failed:", e);
      }
    }

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      iterations++;
      const iterSpanId = this.tracer.startSpan(`iteration_${iterations}`);

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt + contextPrompt },
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
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: apiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          tools: this.tools.size > 0 ? this.getToolDefinitions(activeToolNames) : undefined,
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

        // Fallback: Check for XML tool calls if content exists but native tools don't
        if (toolCalls.length === 0 && content) {
          const parsedTools = this.parseToolCallsFromContent(content);
          if (parsedTools.length > 0) {
            toolCalls = parsedTools;
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
          this.tracer.endSpan(iterSpanId);
          continue;
        }

        // Trigger learning loop
        await this.learn();

        this.tracer.endSpan(iterSpanId);
        this.tracer.endSpan(runSpanId);
        yield { type: "status", status: "completed" };
        yield { type: "complete", summary: content };
        return;
        
      } catch (error) {
        this.tracer.failSpan(iterSpanId, error instanceof Error ? error : new Error(String(error)));
        this.tracer.failSpan(runSpanId, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }

    this.tracer.failSpan(runSpanId, new Error("Max iterations reached"));
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