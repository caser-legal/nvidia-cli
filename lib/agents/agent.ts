// Agent Core - FULLY WIRED VERSION
// All orchestration components are MANDATORY and ACTUALLY USED

import { NVIDIA_API_KEY } from "../api-key";
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
import { ContextManager, getContextLimits } from "../context-manager";
import { executeAgentSpawnHooks, executePostToolUseHooks, executeStopHooks } from "./hooks";
import { createLogger } from "../logger";

const log = createLogger("Agent");

const USE_LOCAL_LLM = "false" === "true";
const CONTEXT_LIMITS = getContextLimits(USE_LOCAL_LLM);

const DEFAULT_CONFIG: AgentConfig = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 0.6,
  topP: 0.95,
  contextWindowTokens: CONTEXT_LIMITS.maxInputTokens,
};

export class Agent {
  private client: OpenAI;
  private config: AgentConfig;
  private tools: Map<string, Tool>;
  private messages: AgentMessage[];
  private systemPrompt: string;
  private baseSystemPrompt: string; // Original prompt before optimizations
  private onEvent?: (event: AgentEvent) => void;
  private flywheelLogger: FlywheelLogger;
  private toolCallRecords: ToolCallRecord[] = [];
  private mode: string = "chat";
  private unifiedContext: UnifiedContext;
  private piiGuard: PIIGuard;
  private piiMap: Map<string, string> = new Map(); // For bidirectional PII handling
  private tracer: Tracer;
  private toolOrchestrator: ToolOrchestrator;
  private feedbackOptimizer: FeedbackOptimizer;
  private autoRAGUpdater: AutoRAGUpdater;
  private evaluator: FlywheelEvaluator;
  private abortSignal?: AbortSignal;
  private contextManager: ContextManager;
  private hooksExecuted = false;

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;
    systemPrompt: string;
    tools?: Tool[];
    config?: Partial<AgentConfig>;
    onEvent?: (event: AgentEvent) => void;
    flywheelLogger: FlywheelLogger; // MANDATORY
    mode?: string;
    unifiedContext: UnifiedContext; // MANDATORY
    toolOrchestrator: ToolOrchestrator; // MANDATORY
    feedbackOptimizer: FeedbackOptimizer; // MANDATORY
    autoRAGUpdater: AutoRAGUpdater; // MANDATORY
    evaluator: FlywheelEvaluator; // MANDATORY
    abortSignal?: AbortSignal;
  }) {
    const useLocalLLM = "false" === "true";
    const ollamaBaseUrl = "http://localhost:11434" || "http://127.0.0.1:11434/v1";
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
    this.baseSystemPrompt = options.systemPrompt;
    this.messages = [];
    this.onEvent = options.onEvent;
    this.abortSignal = options.abortSignal;
    
    // ALL orchestration components are MANDATORY
    this.unifiedContext = options.unifiedContext;
    this.toolOrchestrator = options.toolOrchestrator;
    this.feedbackOptimizer = options.feedbackOptimizer;
    this.autoRAGUpdater = options.autoRAGUpdater;
    this.evaluator = options.evaluator;
    this.flywheelLogger = options.flywheelLogger;
    
    this.contextManager = new ContextManager(useLocalLLM);
    this.piiGuard = new PIIGuard();
    this.tracer = globalTracer;
    this.mode = options.mode || "chat";

    for (const tool of options.tools || []) {
      this.tools.set(tool.name, tool);
    }
    
    log.info(`Agent initialized with ${this.tools.size} tools`);
  }

  private emit(event: AgentEvent) {
    this.onEvent?.(event);
  }

  private getToolDefinitions(allowedNames?: string[]) {
    const tools = Array.from(this.tools.values());
    if (allowedNames && allowedNames.length > 0) {
      return tools.filter(t => allowedNames.includes(t.name)).map(t => t.toDefinition());
    }
    return tools.map((t) => t.toDefinition());
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

  // Bidirectional PII handling
  private redactPII(text: string): string {
    let redacted = text;
    let counter = 0;
    
    // Email
    redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (match) => {
      const placeholder = `[EMAIL_${++counter}]`;
      this.piiMap.set(placeholder, match);
      return placeholder;
    });
    
    // Phone
    redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, (match) => {
      const placeholder = `[PHONE_${++counter}]`;
      this.piiMap.set(placeholder, match);
      return placeholder;
    });
    
    // API keys
    redacted = redacted.replace(/\b(?:sk-[a-zA-Z0-9]{20,}|nvapi-[a-zA-Z0-9_-]{20,})\b/g, (match) => {
      const placeholder = `[API_KEY_${++counter}]`;
      this.piiMap.set(placeholder, match);
      return placeholder;
    });
    
    return redacted;
  }

  private restorePII(text: string): string {
    let restored = text;
    for (const [placeholder, original] of this.piiMap) {
      restored = restored.replace(new RegExp(placeholder.replace(/[[\]]/g, "\\$&"), "g"), original);
    }
    return restored;
  }

  async run(userMessage: string, conversationHistory?: AgentMessage[]): Promise<string> {
    const runSpanId = this.tracer.startSpan("agent_run", { mode: this.mode });
    const startTime = Date.now();
    this.toolCallRecords = [];
    this.piiMap.clear();
    
    // EXECUTE HOOKS - Load user rules BEFORE anything else
    if (!this.hooksExecuted) {
      const hookOutput = await executeAgentSpawnHooks();
      if (hookOutput) {
        this.systemPrompt = `${hookOutput}\n\n${this.systemPrompt}`;
        log.info("Injected agentSpawn hook output into system prompt");
      }
      this.hooksExecuted = true;
    }
    
    // Bidirectional PII handling
    const sanitizedUserMessage = this.redactPII(userMessage);
    
    this.emit({ type: "status", status: "running" });
    this.emit({ type: "message", role: "user", content: sanitizedUserMessage });

    // UNIFIED CONTEXT - Always retrieve context before processing
    let contextPrompt = "";
    try {
      const contextSpanId = this.tracer.startSpan("context_retrieval");
      const contextResult = await this.unifiedContext.retrieve({ query: sanitizedUserMessage });
      this.tracer.endSpan(contextSpanId);
      
      if (contextResult.formattedContext) {
        contextPrompt = `\n\n### Retrieved Context\n${contextResult.formattedContext}`;
        log.debug("Retrieved unified context", { 
          ragDocs: contextResult.ragDocuments.length,
          memories: contextResult.memories.length,
        });
      }
    } catch (error) {
      log.error("Failed to retrieve unified context", { error: String(error) });
    }

    // TOOL ORCHESTRATOR - Select relevant tools for this task
    let activeToolNames: string[] | undefined;
    try {
      const orchSpanId = this.tracer.startSpan("tool_selection");
      activeToolNames = await this.toolOrchestrator.selectTools(sanitizedUserMessage, contextPrompt);
      this.tracer.endSpan(orchSpanId, { selected: activeToolNames });
      
      if (activeToolNames.length > 0) {
        log.debug("Tool orchestrator selected tools", { tools: activeToolNames });
      }
    } catch (e) {
      log.error("Tool selection failed, using all tools", { error: String(e) });
    }

    if (conversationHistory && conversationHistory.length > 0) {
      this.messages = [...conversationHistory];
    }

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 100;
    let finalResponse = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let nudgeCount = 0;
    const MAX_NUDGES = 3;
    let lastRecordId: string | null = null;

    while (iterations < maxIterations) {
      if (this.abortSignal?.aborted) {
        this.emit({ type: "status", status: "completed" });
        return this.restorePII(finalResponse) || "Request cancelled";
      }
      
      iterations++;
      const iterSpanId = this.tracer.startSpan(`iteration_${iterations}`);

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt + contextPrompt },
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
        // Use orchestrator's tool selection
        const toolDefs = this.tools.size > 0 
          ? this.getToolDefinitions(activeToolNames) 
          : undefined;
        
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          toolDefs as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
        if (contextCheck.warning) {
          log.warn(contextCheck.warning);
        }
        
        const finalMessages = contextCheck.truncated ? contextCheck.messages : apiMessages;
        
        const LLM_TIMEOUT_MS = 300000;
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

        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
        }

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
            
            // Execute postToolUse hooks
            try {
              const args = JSON.parse(tc.function.arguments);
              await executePostToolUseHooks(tc.function.name, args, result.content);
            } catch {
              // Silent failure for hooks
            }
          }

          for (const result of results) {
            this.messages.push({ role: "tool", content: result.content, tool_call_id: result.tool_call_id });
          }
          
          this.tracer.endSpan(iterSpanId);
          continue;
        }

        const hasContent = message.content && message.content.trim().length > 50;
        const madeEdits = this.toolCallRecords.some(r => r.toolName === 'file_write' && r.success);
        const userRequestedEdits = /\b(edit|fix|implement|create|build|redesign|update|change|modify|add|remove|refactor|install)\b/i.test(sanitizedUserMessage);
        
        if (userRequestedEdits && !madeEdits && nudgeCount < MAX_NUDGES) {
          nudgeCount++;
          this.messages.push({
            role: "user",
            content: "You have not made any code changes yet. The user requested edits/changes. Use file_write to implement the requested changes NOW.",
          });
          this.tracer.endSpan(iterSpanId);
          continue;
        }
        
        if (!hasContent && !madeEdits && nudgeCount < MAX_NUDGES) {
          nudgeCount++;
          this.messages.push({
            role: "user",
            content: "Please provide a substantive response or use tools to complete the task.",
          });
          this.tracer.endSpan(iterSpanId);
          continue;
        }
        
        // TASK COMPLETE - Run all learning/logging
        log.info("Task completed");
        this.emit({ type: "status", status: "completed" });
        
        // Log to flywheel
        const historyForLog = (conversationHistory || []).map(m => ({ role: m.role, content: m.content || "" }));
        const record = await this.flywheelLogger.logInteraction({
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
        
        if (record) {
          lastRecordId = record.id;
        }
        
        // Run learning pipeline
        await this.learn(lastRecordId);
        
        // Execute stop hooks
        await executeStopHooks();

        this.tracer.endSpan(runSpanId, { status: "completed" });
        
        // Restore PII before returning
        return this.restorePII(message.content || "");

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

  async *runStream(userMessage: string): AsyncGenerator<AgentEvent> {
    // Execute hooks first
    if (!this.hooksExecuted) {
      const hookOutput = await executeAgentSpawnHooks();
      if (hookOutput) {
        this.systemPrompt = `${hookOutput}\n\n${this.systemPrompt}`;
      }
      this.hooksExecuted = true;
    }
    
    const sanitizedUserMessage = this.redactPII(userMessage);

    yield { type: "status", status: "running" };
    yield { type: "message", role: "user", content: sanitizedUserMessage };

    // Get unified context
    let contextPrompt = "";
    try {
      const contextResult = await this.unifiedContext.retrieve({ query: sanitizedUserMessage });
      if (contextResult.formattedContext) {
        contextPrompt = `\n\n### Retrieved Context\n${contextResult.formattedContext}`;
      }
    } catch (error) {
      log.error("Failed to retrieve unified context", { error: String(error) });
    }

    // Get tool selection
    let activeToolNames: string[] | undefined;
    try {
      activeToolNames = await this.toolOrchestrator.selectTools(sanitizedUserMessage, contextPrompt);
    } catch {
      // Use all tools on failure
    }

    this.messages.push({ role: "user", content: sanitizedUserMessage });

    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      if (this.abortSignal?.aborted) return;
      
      iterations++;

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt + contextPrompt },
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
        const toolDefs = this.tools.size > 0 
          ? this.getToolDefinitions(activeToolNames) 
          : undefined;
        
        const contextCheck = this.contextManager.prepareForAPI(
          apiMessages,
          toolDefs as OpenAI.ChatCompletionTool[] | undefined,
          "tool_results_first"
        );
        
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
            
            // Execute postToolUse hooks
            try {
              const args = JSON.parse(tc.function.arguments);
              await executePostToolUseHooks(tc.function.name, args, result.content);
            } catch {
              // Silent
            }
          }
          continue;
        }

        await executeStopHooks();
        yield { type: "status", status: "completed" };
        yield { type: "complete", summary: this.restorePII(content) };
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

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    let { name, arguments: argsString } = toolCall.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      args = { raw: argsString };
    }
    
    const { resolveToolAlias } = await import("./tools/registry");
    const resolved = resolveToolAlias(name, args);
    name = resolved.name;
    args = resolved.args;
    
    const tool = this.tools.get(name);
    const toolStartTime = Date.now();
    const spanId = this.tracer.startSpan(`tool_exec_${name}`, { args });

    if (!tool) {
      const error = `Tool ${name} not found`;
      this.tracer.failSpan(spanId, new Error(error));
      return { tool_call_id: toolCall.id, content: error, is_error: true };
    }

    try {
      const content = await tool.execute(args);
      
      this.toolCallRecords.push({
        toolName: name,
        arguments: args,
        result: content,
        durationMs: Date.now() - toolStartTime,
        success: true
      });

      this.tracer.endSpan(spanId, { success: true });
      return { tool_call_id: toolCall.id, content };
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

      return { tool_call_id: toolCall.id, content: `Error: ${errorMessage}`, is_error: true };
    }
  }

  private async learn(recordId: string | null): Promise<void> {
    // EVALUATOR - Score the interaction and PERSIST the scores
    if (recordId) {
      try {
        const records = this.flywheelLogger.getRecords();
        const record = records.find(r => r.id === recordId);
        
        if (record) {
          const scores = await this.evaluator.evaluateRecord(record);
          
          // ACTUALLY PERSIST THE SCORES (this was missing!)
          await this.flywheelLogger.addEvaluationScores(recordId, scores);
          
          log.info("Evaluation scores persisted", { 
            recordId, 
            score: scores.overallScore,
          });
        }
      } catch (e) {
        log.error("Evaluation failed", { error: String(e) });
      }
    }

    // FEEDBACK OPTIMIZER - Generate AND APPLY optimizations
    try {
      const optimizations = await this.feedbackOptimizer.generateOptimizations();
      if (optimizations.failurePatterns.length > 0) {
        log.info("Feedback optimizer found patterns", {
          patterns: optimizations.failurePatterns.length,
          insights: optimizations.insights,
        });
        
        // ACTUALLY APPLY the improved system prompt for next run
        if (optimizations.improvedSystemPrompt) {
          this.systemPrompt = this.baseSystemPrompt + "\n\n## LEARNED IMPROVEMENTS\n" + optimizations.improvedSystemPrompt;
          log.info("Applied feedback optimizer improvements to system prompt");
        }
      }
    } catch (e) {
      log.error("Feedback optimization failed", { error: String(e) });
    }

    // AUTO-RAG UPDATER - Sync high-quality records to RAG
    try {
      const ingestedCount = await this.autoRAGUpdater.sync();
      if (ingestedCount > 0) {
        log.info("Auto-RAG sync completed", { ingestedCount });
      }
    } catch (e) {
      log.error("Auto-RAG sync failed", { error: String(e) });
    }
  }
}
