/**
 * Context Manager for NVIDIA NIM API
 * 
 * Handles token counting, context window management, and intelligent truncation
 * to prevent context overflow errors.
 * 
 * NVIDIA API Limits (as of December 2025):
 * - Hosted API (integrate.api.nvidia.com): 262,144 tokens (free tier limit)
 * - Self-hosted NIM: Up to 1,000,000 tokens (model native limit)
 * - Local Ollama: Depends on configuration (typically 128K-1M)
 */

import OpenAI from "openai";

// Token estimation using cl100k_base approximation
// More accurate than simple char/4 for code and technical content
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Base estimation: ~4 chars per token for English prose
  // Adjust for code (more tokens due to symbols) and whitespace
  const codePatterns = /[{}()\[\];:,.<>!=+\-*/%&|^~`@#$\\]/g;
  const codeSymbols = (text.match(codePatterns) || []).length;
  
  // Code has ~3 chars per token due to symbols
  // Prose has ~4 chars per token
  const codeRatio = codeSymbols / text.length;
  const avgCharsPerToken = 4 - (codeRatio * 1); // 3-4 range
  
  return Math.ceil(text.length / avgCharsPerToken);
}

// Estimate tokens for a message array (OpenAI format)
export function estimateMessagesTokens(
  messages: OpenAI.ChatCompletionMessageParam[]
): number {
  let total = 0;
  
  for (const msg of messages) {
    // Role overhead: ~4 tokens per message
    total += 4;
    
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          total += estimateTokens(part.text);
        } else if (part.type === "image_url") {
          // Images use ~85 tokens for low detail, ~765 for high detail
          total += part.image_url?.detail === "high" ? 765 : 85;
        }
      }
    }
    
    // Tool calls add overhead
    if ("tool_calls" in msg && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function.name);
        total += estimateTokens(tc.function.arguments);
        total += 10; // Structural overhead
      }
    }
  }
  
  return total;
}

// Estimate tokens for tool definitions
export function estimateToolsTokens(
  tools: OpenAI.ChatCompletionTool[] | undefined
): number {
  if (!tools || tools.length === 0) return 0;
  
  let total = 0;
  for (const tool of tools) {
    total += estimateTokens(tool.function.name);
    total += estimateTokens(tool.function.description || "");
    total += estimateTokens(JSON.stringify(tool.function.parameters || {}));
    total += 20; // Structural overhead per tool
  }
  
  return total;
}

// Context window limits by backend
export interface ContextLimits {
  maxInputTokens: number;      // Maximum input context
  maxOutputTokens: number;     // Maximum output tokens
  reserveForOutput: number;    // Reserve space for response
  warningThreshold: number;    // Warn when exceeding this %
}

export function getContextLimits(useLocalLLM: boolean): ContextLimits {
  if (useLocalLLM) {
    // Self-hosted: Full 1M context available
    return {
      maxInputTokens: 1000000,
      maxOutputTokens: 32768,
      reserveForOutput: 32768,
      warningThreshold: 0.9, // Warn at 90%
    };
  } else {
    // Hosted API: 262K limit (free tier)
    return {
      maxInputTokens: 262144,
      maxOutputTokens: 32768,
      reserveForOutput: 32768,
      warningThreshold: 0.85, // Warn at 85%
    };
  }
}

// Context truncation strategies
export type TruncationStrategy = 
  | "sliding_window"      // Keep most recent messages
  | "smart_summarize"     // Summarize older messages
  | "tool_results_first"  // Truncate tool results first
  | "preserve_system";    // Always keep system prompt

export interface TruncationResult {
  messages: OpenAI.ChatCompletionMessageParam[];
  truncated: boolean;
  originalTokens: number;
  finalTokens: number;
  removedCount: number;
  strategy: TruncationStrategy;
}

/**
 * Truncate messages to fit within context window
 */
export function truncateMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  toolsTokens: number = 0,
  strategy: TruncationStrategy = "tool_results_first"
): TruncationResult {
  const originalTokens = estimateMessagesTokens(messages);
  const availableTokens = maxTokens - toolsTokens;
  
  if (originalTokens <= availableTokens) {
    return {
      messages,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
      removedCount: 0,
      strategy,
    };
  }
  
  let truncatedMessages = [...messages];
  let removedCount = 0;
  
  switch (strategy) {
    case "tool_results_first":
      // First pass: Truncate long tool results
      truncatedMessages = truncatedMessages.map(msg => {
        if (msg.role === "tool" && typeof msg.content === "string") {
          const tokens = estimateTokens(msg.content);
          if (tokens > 5000) {
            // Truncate to ~2000 tokens with indicator
            const truncatedContent = msg.content.slice(0, 8000) + 
              "\n\n[... truncated " + (msg.content.length - 8000) + " chars to fit context window ...]";
            return { ...msg, content: truncatedContent };
          }
        }
        return msg;
      });
      
      // Check if that was enough
      let currentTokens = estimateMessagesTokens(truncatedMessages);
      if (currentTokens <= availableTokens) {
        return {
          messages: truncatedMessages,
          truncated: true,
          originalTokens,
          finalTokens: currentTokens,
          removedCount: 0,
          strategy,
        };
      }
      
      // Second pass: Remove oldest non-system messages
      // Keep system prompt (index 0) and most recent messages
      const systemMsg = truncatedMessages[0];
      const otherMsgs = truncatedMessages.slice(1);
      
      while (currentTokens > availableTokens && otherMsgs.length > 2) {
        // Remove oldest message (after system)
        otherMsgs.shift();
        removedCount++;
        currentTokens = estimateMessagesTokens([systemMsg, ...otherMsgs]);
      }
      
      truncatedMessages = [systemMsg, ...otherMsgs];
      break;
      
    case "sliding_window":
      // Keep system prompt and most recent N messages
      const system = truncatedMessages[0];
      let recent = truncatedMessages.slice(1);
      
      while (estimateMessagesTokens([system, ...recent]) > availableTokens && recent.length > 1) {
        recent.shift();
        removedCount++;
      }
      
      truncatedMessages = [system, ...recent];
      break;
      
    case "preserve_system":
      // Only keep system prompt and last user message
      const sysPrompt = truncatedMessages[0];
      const lastUser = truncatedMessages.filter(m => m.role === "user").pop();
      
      if (lastUser) {
        truncatedMessages = [sysPrompt, lastUser];
        removedCount = messages.length - 2;
      }
      break;
  }
  
  const finalTokens = estimateMessagesTokens(truncatedMessages);
  
  return {
    messages: truncatedMessages,
    truncated: true,
    originalTokens,
    finalTokens,
    removedCount,
    strategy,
  };
}

/**
 * Context Manager class for managing conversation context
 */
export class ContextManager {
  private limits: ContextLimits;
  private useLocalLLM: boolean;
  
  constructor(useLocalLLM: boolean = false) {
    this.useLocalLLM = useLocalLLM;
    this.limits = getContextLimits(useLocalLLM);
  }
  
  /**
   * Get current context limits
   */
  getLimits(): ContextLimits {
    return this.limits;
  }
  
  /**
   * Check if messages fit within context window
   */
  checkFit(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools?: OpenAI.ChatCompletionTool[]
  ): {
    fits: boolean;
    currentTokens: number;
    maxTokens: number;
    utilization: number;
    warning: string | null;
  } {
    const messagesTokens = estimateMessagesTokens(messages);
    const toolsTokens = estimateToolsTokens(tools);
    const totalTokens = messagesTokens + toolsTokens;
    const availableTokens = this.limits.maxInputTokens - this.limits.reserveForOutput;
    const utilization = totalTokens / availableTokens;
    
    let warning: string | null = null;
    
    if (utilization >= 1) {
      warning = `Context overflow: ${totalTokens.toLocaleString()} tokens exceeds limit of ${availableTokens.toLocaleString()}`;
    } else if (utilization >= this.limits.warningThreshold) {
      warning = `Context ${Math.round(utilization * 100)}% full (${totalTokens.toLocaleString()}/${availableTokens.toLocaleString()} tokens)`;
    }
    
    return {
      fits: totalTokens <= availableTokens,
      currentTokens: totalTokens,
      maxTokens: availableTokens,
      utilization,
      warning,
    };
  }
  
  /**
   * Prepare messages for API call, truncating if necessary
   */
  prepareForAPI(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools?: OpenAI.ChatCompletionTool[],
    strategy: TruncationStrategy = "tool_results_first"
  ): {
    messages: OpenAI.ChatCompletionMessageParam[];
    truncated: boolean;
    warning: string | null;
    stats: {
      originalTokens: number;
      finalTokens: number;
      removedMessages: number;
    };
  } {
    const toolsTokens = estimateToolsTokens(tools);
    const availableTokens = this.limits.maxInputTokens - this.limits.reserveForOutput;
    
    const result = truncateMessages(messages, availableTokens, toolsTokens, strategy);
    
    let warning: string | null = null;
    if (result.truncated) {
      warning = `Context truncated: ${result.originalTokens.toLocaleString()} → ${result.finalTokens.toLocaleString()} tokens (removed ${result.removedCount} messages)`;
    }
    
    const check = this.checkFit(result.messages, tools);
    if (check.warning && !warning) {
      warning = check.warning;
    }
    
    return {
      messages: result.messages,
      truncated: result.truncated,
      warning,
      stats: {
        originalTokens: result.originalTokens,
        finalTokens: result.finalTokens,
        removedMessages: result.removedCount,
      },
    };
  }
  
  /**
   * Get a summary of context usage
   */
  getUsageSummary(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools?: OpenAI.ChatCompletionTool[]
  ): string {
    const check = this.checkFit(messages, tools);
    const backend = this.useLocalLLM ? "Local (Ollama)" : "Hosted (NVIDIA API)";
    
    return [
      `Backend: ${backend}`,
      `Context: ${check.currentTokens.toLocaleString()} / ${check.maxTokens.toLocaleString()} tokens`,
      `Utilization: ${Math.round(check.utilization * 100)}%`,
      check.warning ? `⚠️ ${check.warning}` : "✓ Within limits",
    ].join("\n");
  }
}

// Export singleton for convenience
let defaultManager: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!defaultManager) {
    const useLocalLLM = process.env.USE_LOCAL_LLM === "true";
    defaultManager = new ContextManager(useLocalLLM);
  }
  return defaultManager;
}

// Reset manager (useful for testing or config changes)
export function resetContextManager(): void {
  defaultManager = null;
}
