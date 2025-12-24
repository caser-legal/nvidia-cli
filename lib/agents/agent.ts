// Agent Core
// Main agent loop using NVIDIA NIM API with tool execution
// Integrated with Data Flywheel for continuous model improvement
// Context management for handling API token limits

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
import { Tracer, globalTracer } from "./observability/tracer";
import { ToolOrchestrator } from "./tool-orchestrator";
import { FeedbackOptimizer } from "./feedback-optimizer";
import { AutoRAGUpdater } from "./rag/auto-updater";
import { FlywheelEvaluator } from "./flywheel/evaluator";
import { 
  ContextManager, 
  getContextLimits
} from "../context-manager";

// Check if using local LLM
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === "true";
const CONTEXT_LIMITS = getContextLimits(USE_LOCAL_LLM);

// Default to Nano-30B with NVIDIA recommended settings for tool calling
const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 0.6,  // NVIDIA recommends 0.6 for tool calling (not 1.0)
  topP: 0.95,        // NVIDIA recommends 0.95 for tool calling (not 1.0)
  // Use actual API limit, not model native limit
  contextWindowTokens: CONTEXT_LIMITS.maxInputTokens,
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
  private tracer: Tracer;
  private toolOrchestrator?: ToolOrchestrator;
  private feedbackOptimizer?: FeedbackOptimizer;
  private autoRAGUpdater?: AutoRAGUpdater;
  private evaluator?: FlywheelEvaluator;
  private abortSignal?: AbortSignal;
  private contextManager: ContextManager;

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
    evaluator?: FlywheelEvaluator;
    abortSignal?: AbortSignal;
  }) {
    const useLocalLLM = process.env.USE_LOCAL_LLM === "true";
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://192.168.50.50:11434/v1";
    const apiKey = useLocalLLM ? "ollama" : (options.apiKey || process.env.NVIDIA_API_KEY);
    
    if (!useLocalLLM && !apiKey) {
      throw new Error("NVIDIA_API_KEY is required. Set it in .env.local or pass it to the Agent constructor.");
    }
    
    this.client = new OpenAI({
      baseURL: useLocalLLM ? ollamaBaseUrl : (options.baseUrl || "https://integrate.api.nvidia.com/v1"),
      apiKey,
    });

    this.config = { ...DEFAULT_CONFIG, ...options.config };
    // Map model name for Ollama
    if (useLocalLLM && this.config.model === "nvidia/nemotron-3-nano-30b-a3b") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.config.model = "nemotron-3-nano" as any;
    }
    this.systemPrompt = options.systemPrompt;
    this.tools = new Map();
    this.messages = [];
    this.onEvent = options.onEvent;
    this.unifiedContext = options.unifiedContext;
    this.toolOrchestrator = options.toolOrchestrator;
    this.feedbackOptimizer = options.feedbackOptimizer;
    this.autoRAGUpdater = options.autoRAGUpdater;
    this.evaluator = options.evaluator;
    this.abortSignal = options.abortSignal;
    
    // Initialize Context Manager with correct backend limits
    this.contextManager = new ContextManager(useLocalLLM);
    const limits = this.contextManager.getLimits();
    console.log(`[Agent] Context limits: ${limits.maxInputTokens.toLocaleString()} tokens (${useLocalLLM ? 'local' : 'hosted API'})`);
    
    // Initialize Security & Observability
    this.piiGuard = new PIIGuard();
    this.tracer = globalTracer;

    for (const tool of options.tools || []) {
      this.tools.set(tool.name, tool);
    }
    
    console.log("[Agent] Constructor - registered", this.tools.size, "tools:", Array.from(this.tools.keys()).join(", "));
    
    // Initialize flywheel logging
    this.flywheelLogger = options.flywheelLogger;
    this.mode = options.mode || "chat";
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  private getToolDefinitions(allowedNames?: string[]) {
    const tools = Array.from(this.tools.values());
    if (allowedNames) {
      return tools.filter(t => allowedNames.includes(t.name)).map(t => t.toDefinition());
    }
    return tools.map((t) => t.toDefinition());
  }

  private parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    if (!content) return toolCalls;
    
    // Regex to capture <tool_call> ... </tool_call>
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;

    console.log("[Agent] Parsing content for tool calls, length:", content.length);
    console.log("[Agent] Content preview:", content.substring(0, 500));

    while ((match = toolCallRegex.exec(content)) !== null) {
      const inner = match[1];
      console.log("[Agent] Found tool_call block:", inner);
      
      // Extract function name
      const funcMatch = /<function=([a-zA-Z0-9_]+)>/.exec(inner);
      if (!funcMatch) {
        console.log("[Agent] No function match found in:", inner);
        continue;
      }
      const name = funcMatch[1];
      console.log("[Agent] Function name:", name);

      // Extract parameters
      const args: Record<string, unknown> = {};
      const paramRegex = /<parameter=([a-zA-Z0-9_]+)>([\s\S]*?)<\/parameter>/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(inner)) !== null) {
        const key = paramMatch[1];
        const value = paramMatch[2].trim();
        args[key] = value;
        console.log("[Agent] Parameter:", key, "=", value);
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
    
    console.log("[Agent] Total tool calls parsed:", toolCalls.length);
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
        }
      } catch (error) {
        console.error("Failed to retrieve unified context:", error);
      }
    }

    // All tools are passed to LLM - it decides which to use
    // ToolOrchestrator was removed as it added latency without benefit

    // Initialize with conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    // Add user message
    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 1000; // Extended for long-running tasks
    let finalResponse = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let nudgeCount = 0;
    const MAX_NUDGES = 3; // Prevent infinite nudge loops

    while (iterations < maxIterations) {
      // Check for abort
      if (this.abortSignal?.aborted) {
        this.emit({ type: "status", status: "completed" });
        return finalResponse || "Request cancelled";
      }
      
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
        const toolDefs = this.tools.size > 0 ? this.getToolDefinitions() : undefined;
        
        // Context management: Check and truncate if needed
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          toolDefs as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
        if (contextCheck.warning) {
          console.log(`[Agent] Context warning: ${contextCheck.warning}`);
          this.emit({ 
            type: "status", 
            status: "thinking", 
            message: contextCheck.warning 
          });
        }
        
        // Use truncated messages if needed
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;
        
        console.log("[Agent] Sending to LLM with", toolDefs?.length || 0, "tools");
        console.log(`[Agent] Context: ${contextCheck.stats.finalTokens.toLocaleString()} tokens`);
        if (toolDefs && toolDefs.length > 0) {
          console.log("[Agent] Tool names:", toolDefs.map(t => t.function.name).join(", "));
        }
        
        // Call NVIDIA NIM API with managed context and timeout
        const LLM_TIMEOUT_MS = 120000; // 2 minutes
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), LLM_TIMEOUT_MS);
        
        let response;
        try {
          response = await this.client.chat.completions.create({
            model: this.config.model,
            messages: finalMessages,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            top_p: this.config.topP,
            tools: toolDefs,
            tool_choice: toolDefs && toolDefs.length > 0 ? "auto" : undefined,
          }, { signal: timeoutController.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        // Track token usage
        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
        }

        const choice = response.choices[0];
        const message = choice.message;
        
        console.log("[Agent] LLM response - native tool_calls:", message.tool_calls?.length || 0);
        console.log("[Agent] LLM response - content:", message.content?.substring(0, 200));

        // Fallback: Check for XML tool calls if native ones are missing
        if (!message.tool_calls && message.content) {
          const parsedTools = this.parseToolCallsFromContent(message.content);
          if (parsedTools.length > 0) {
            console.log("[Agent] Parsed XML tool calls:", JSON.stringify(parsedTools, null, 2));
            message.tool_calls = parsedTools;
          }
        }
        
        console.log("[Agent] Tool calls to execute:", message.tool_calls?.length || 0);

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
          console.log("[Agent] Executing", message.tool_calls.length, "tool(s)...");
          
          // Execute tools and emit events
          const results: ToolResult[] = [];
          for (const tc of message.tool_calls as ToolCall[]) {
            this.emit({ type: "tool_call", name: tc.function.name, args: tc.function.arguments });
            const result = await this.executeToolCall(tc);
            this.emit({ type: "tool_result", name: tc.function.name, result: result.content, is_error: result.is_error });
            results.push(result);
          }
          
          console.log("[Agent] Tool results:", JSON.stringify(results.map(r => ({ 
            id: r.tool_call_id, 
            error: r.is_error,
            content: r.content.substring(0, 300) 
          })), null, 2));

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

        // No tool calls - check if LLM actually responded or just gave up
        const hasContent = message.content && message.content.trim().length > 50;
        console.log(`[Agent] No tool calls. hasContent=${hasContent}, iterations=${iterations}, content length=${message.content?.length || 0}`);
        
        // Nudge if no content and we haven't made any file_write calls yet
        const madeEdits = this.toolCallRecords.some(r => r.toolName === 'file_write' && r.success);
        if (!hasContent && !madeEdits && nudgeCount < MAX_NUDGES) {
          nudgeCount++;
          console.log(`[Agent] No edits made yet, nudging LLM (${nudgeCount}/${MAX_NUDGES})...`);
          this.messages.push({
            role: "user",
            content: "You have not made any code changes yet. Use file_write(operation='edit', path='...', old_text='exact text to replace', new_text='replacement text') to implement improvements NOW. Do not just read files - EDIT them.",
          });
          this.tracer.endSpan(iterSpanId);
          continue;
        }
        
        // If we've exhausted nudges without edits, return graceful failure
        if (!hasContent && !madeEdits && nudgeCount >= MAX_NUDGES) {
          console.log("[Agent] Max nudges reached without edits, returning failure");
          this.emit({ type: "status", status: "completed" });
          return "I was unable to complete the requested edits after multiple attempts. Please provide more specific instructions about what changes you'd like me to make, including the exact file paths and the specific code sections to modify.";
        }
        
        console.log("[Agent] Marking task as completed");
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
      } catch (e) {
        console.error("Tool selection failed:", e);
      }
    }

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 1000; // Extended for long-running tasks

    while (iterations < maxIterations) {
      // Check for abort
      if (this.abortSignal?.aborted) {
        return;
      }
      
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
        const toolDefs = this.tools.size > 0 ? this.getToolDefinitions() : undefined;
        
        // Context management: Check and truncate if needed
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          toolDefs as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
        if (contextCheck.warning) {
          console.log(`[Agent] Context warning: ${contextCheck.warning}`);
          yield { 
            type: "status", 
            status: "thinking", 
            message: contextCheck.warning 
          };
        }
        
        // Use truncated messages if needed
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;
        
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: finalMessages,
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

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    let { name, arguments: argsString } = toolCall.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      args = { raw: argsString }; // Fallback for poorly formatted JSON
    }
    
    // Use shared tool alias resolution
    const { resolveToolAlias } = await import("./tools/registry");
    const resolved = resolveToolAlias(name, args);
    if (resolved.name !== name) {
      console.log(`[Agent] Redirecting "${name}" to "${resolved.name}"`);
    }
    name = resolved.name;
    args = resolved.args;
    
    const tool = this.tools.get(name);
    const toolStartTime = Date.now();
    const spanId = this.tracer.startSpan(`tool_exec_${name}`, { args });

    if (!tool) {
      const error = `Tool ${name} not found`;
      this.tracer.failSpan(spanId, new Error(error));
      return {
        tool_call_id: toolCall.id,
        content: error,
        is_error: true,
      };
    }

    try {
      const content = await tool.execute(args);
      
      // Record for flywheel
      this.toolCallRecords.push({
        toolName: name,
        arguments: args,
        result: content,
        durationMs: Date.now() - toolStartTime,
        success: true
      });

      this.tracer.endSpan(spanId, { success: true });
      return {
        tool_call_id: toolCall.id,
        content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.tracer.failSpan(spanId, error instanceof Error ? error : new Error(errorMessage));
      
      this.toolCallRecords.push({
        toolName: name,
        arguments: args,
        result: `Error: ${errorMessage}`,
        durationMs: Date.now() - toolStartTime,
        success: false,
        error: errorMessage
      });

      return {
        tool_call_id: toolCall.id,
        content: `Error: ${errorMessage}`,
        is_error: true,
      };
    }
  }

  private async learn(): Promise<void> {
    // 1. Run automatic evaluation if evaluator is available
    if (this.evaluator && this.flywheelLogger) {
      const records = this.flywheelLogger.getRecords();
      const lastRecord = records[records.length - 1];
      if (lastRecord && !lastRecord.qualitySignals?.overallScore) {
        try {
          const scores = await this.evaluator.evaluateRecord(lastRecord);
          // Update the record with judge scores
          lastRecord.qualitySignals = {
            overallScore: scores.overall || 5,
            helpfulness: scores.helpfulness,
            accuracy: scores.accuracy,
            reasoning: String(scores.reasoning || ""),
            responseLength: lastRecord.qualitySignals?.responseLength || 0,
            toolCallCount: lastRecord.qualitySignals?.toolCallCount || 0,
            errorCount: lastRecord.qualitySignals?.errorCount || 0,
          };
        } catch (e) {
          console.error("Auto-evaluation failed:", e);
        }
      }
    }

    // 2. Run feedback optimizer and auto RAG updater if available
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.feedbackOptimizer as any)?.generateOptimizations?.(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.autoRAGUpdater as any)?.sync?.(),
    ].filter(Boolean));
  }
}