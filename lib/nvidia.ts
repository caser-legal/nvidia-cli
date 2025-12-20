// NVIDIA NIM API Client - Complete Implementation
// Supports all NVIDIA NIM features as of December 2025

import OpenAI from "openai";

// API Configuration
const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";

// Available Models (December 2025) - Optimized for iOS coding
export const NVIDIA_MODELS = {
  // Nemotron 3 Nano - NEW flagship (Dec 15, 2025) - hybrid Mamba-Transformer MoE
  "nvidia/nemotron-3-nano-30b-a3b": {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    name: "Nemotron 3 Nano",
    description: "31.6B params, 3.6B active, hybrid Mamba-Transformer MoE, 1M context, reasoning ON/OFF, 3.3x faster",
    contextWindow: 1000000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: true,
    supportsThinkingBudget: true,
  },
  // Nemotron Super 49B v1.5 - Best for agentic tasks
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    name: "Nemotron Super 49B",
    description: "Top reasoning model, 97.4% MATH500, best for agentic coding tasks",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
    thinkingPrompt: "/no_think",
  },
  // Nemotron Ultra 253B - Largest reasoning model
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    name: "Nemotron Ultra 253B",
    description: "Largest Nemotron, maximum reasoning capability",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
    thinkingPrompt: "detailed thinking off",
  },
  // Qwen3 Coder 480B - Massive coding specialist
  "qwen/qwen3-coder-480b-a35b-instruct": {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    name: "Qwen3 Coder 480B",
    description: "480B params, 35B active, specialized for code generation",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // Devstral 2 123B - Excellent coding model
  "mistralai/devstral-2-123b-instruct-2512": {
    id: "mistralai/devstral-2-123b-instruct-2512",
    name: "Devstral 2 123B",
    description: "123B coding specialist from Mistral, excellent for development",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // DeepSeek R1 - Strong reasoning
  "deepseek-ai/deepseek-r1": {
    id: "deepseek-ai/deepseek-r1",
    name: "DeepSeek R1",
    description: "State-of-the-art reasoning, math, and coding",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: false,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // DeepSeek V3.2 - Latest DeepSeek
  "deepseek-ai/deepseek-v3.2": {
    id: "deepseek-ai/deepseek-v3.2",
    name: "DeepSeek V3.2",
    description: "Latest DeepSeek with hybrid inference",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // Llama 3.3 70B
  "meta/llama-3.3-70b-instruct": {
    id: "meta/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    description: "Meta's latest Llama with strong reasoning",
    contextWindow: 128000,
    maxTokens: 8192,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // Qwen3 235B - Large general model
  "qwen/qwen3-235b-a22b": {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B",
    description: "235B params, 22B active, strong general reasoning",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
  // Vision Model
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": {
    id: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    name: "Nemotron Nano VL 8B",
    description: "Vision-language model for image understanding",
    contextWindow: 128000,
    maxTokens: 4096,
    supportsTools: false,
    supportsImages: true,
    supportsStreaming: true,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
  },
} as const;

export type ModelId = keyof typeof NVIDIA_MODELS;

// Create OpenAI-compatible client for NVIDIA NIM
export function createNvidiaClient(apiKey?: string) {
  return new OpenAI({
    baseURL: NVIDIA_API_BASE,
    apiKey: apiKey || NVIDIA_API_KEY,
  });
}

// Message types
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

// Tool/Function calling types
export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Parallel reasoning mode for Nemotron 3 Nano
export type ParallelReasoningMode = "none" | "low" | "medium" | "heavy";

// Chat completion options
export interface ChatCompletionOptions {
  model: ModelId;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  tools?: Tool[];
  toolChoice?: "none" | "auto" | { type: "function"; function: { name: string } };
  stop?: string[];
  parallelReasoningMode?: ParallelReasoningMode;
  reasoningBudget?: number;
  enableThinking?: boolean;
}

// Response types
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }[];
    };
    finish_reason: string;
  }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// Streaming chunk type
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason: string | null;
  }[];
}

// Build extra body params for Nemotron reasoning features
// Per NVIDIA docs: these params MUST be nested inside chat_template_kwargs
function buildReasoningParams(options: ChatCompletionOptions, modelConfig: typeof NVIDIA_MODELS[ModelId]) {
  const chatTemplateKwargs: Record<string, unknown> = {};
  
  // Nemotron 3 Nano parallel reasoning mode
  if (modelConfig.supportsParallelReasoning && options.parallelReasoningMode) {
    chatTemplateKwargs.parallel_reasoning_mode = options.parallelReasoningMode;
  }
  
  // Nemotron 3 Nano thinking budget control
  if (modelConfig.supportsThinkingBudget) {
    if (options.reasoningBudget !== undefined) {
      chatTemplateKwargs.reasoning_budget = options.reasoningBudget;
    }
    if (options.enableThinking !== undefined) {
      chatTemplateKwargs.enable_thinking = options.enableThinking;
    }
  }
  
  return Object.keys(chatTemplateKwargs).length > 0 
    ? { chat_template_kwargs: chatTemplateKwargs } 
    : undefined;
}

// Main chat completion function
export async function createChatCompletion(
  options: ChatCompletionOptions,
  apiKey?: string
): Promise<ChatCompletionResponse> {
  const client = createNvidiaClient(apiKey);
  const modelConfig = NVIDIA_MODELS[options.model];
  const reasoningParams = buildReasoningParams(options, modelConfig);

  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages as OpenAI.ChatCompletionMessageParam[],
    temperature: options.temperature ?? 1,
    max_tokens: options.maxTokens ?? modelConfig.maxTokens,
    top_p: options.topP ?? 1,
    stream: false,
    tools: modelConfig.supportsTools ? options.tools as OpenAI.ChatCompletionTool[] : undefined,
    tool_choice: modelConfig.supportsTools ? options.toolChoice as OpenAI.ChatCompletionToolChoiceOption : undefined,
    stop: options.stop,
    ...reasoningParams,
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);

  return response as unknown as ChatCompletionResponse;
}

// Streaming chat completion
export async function* streamChatCompletion(
  options: ChatCompletionOptions,
  apiKey?: string
): AsyncGenerator<ChatCompletionChunk> {
  const client = createNvidiaClient(apiKey);
  const modelConfig = NVIDIA_MODELS[options.model];
  const reasoningParams = buildReasoningParams(options, modelConfig);

  const stream = await client.chat.completions.create({
    model: options.model,
    messages: options.messages as OpenAI.ChatCompletionMessageParam[],
    temperature: options.temperature ?? 1,
    max_tokens: options.maxTokens ?? modelConfig.maxTokens,
    top_p: options.topP ?? 1,
    stream: true,
    tools: modelConfig.supportsTools ? options.tools as OpenAI.ChatCompletionTool[] : undefined,
    tool_choice: modelConfig.supportsTools ? options.toolChoice as OpenAI.ChatCompletionToolChoiceOption : undefined,
    stop: options.stop,
    ...reasoningParams,
  } as OpenAI.ChatCompletionCreateParamsStreaming);

  for await (const chunk of stream) {
    yield chunk as unknown as ChatCompletionChunk;
  }
}

// Token estimation
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Cost estimation (free tier)
export function estimateCost(inputTokens: number, outputTokens: number, model: ModelId): number {
  return 0;
}

// Model capability checks
export function modelSupportsImages(model: ModelId): boolean {
  return NVIDIA_MODELS[model]?.supportsImages ?? false;
}

export function modelSupportsTools(model: ModelId): boolean {
  return NVIDIA_MODELS[model]?.supportsTools ?? false;
}

export function modelSupportsParallelReasoning(model: ModelId): boolean {
  return NVIDIA_MODELS[model]?.supportsParallelReasoning ?? false;
}

export function modelSupportsThinkingBudget(model: ModelId): boolean {
  return NVIDIA_MODELS[model]?.supportsThinkingBudget ?? false;
}

export function getModelInfo(model: ModelId) {
  return NVIDIA_MODELS[model];
}

export function listModels() {
  return Object.values(NVIDIA_MODELS);
}

export function isValidApiKey(key: string): boolean {
  return key.startsWith("nvapi-") && key.length > 20;
}

// Rate limit tracking (40 RPM for free tier)
const rateLimitState = {
  requests: [] as number[],
  limit: 40,
  window: 60000,
};

export function checkRateLimit(): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  rateLimitState.requests = rateLimitState.requests.filter((time) => now - time < rateLimitState.window);
  const remaining = rateLimitState.limit - rateLimitState.requests.length;
  const oldestRequest = rateLimitState.requests[0];
  const resetIn = oldestRequest ? rateLimitState.window - (now - oldestRequest) : 0;
  return { allowed: remaining > 0, remaining, resetIn };
}

export function recordRequest(): void {
  rateLimitState.requests.push(Date.now());
}
