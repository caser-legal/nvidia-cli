// NVIDIA NIM API Client - Complete Implementation
// Supports all NVIDIA NIM features as of December 2025

import OpenAI from "openai";

// API Configuration - supports local Ollama or NVIDIA NIM
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === "true";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://192.168.50.50:11434/v1";
const NVIDIA_API_BASE = USE_LOCAL_LLM ? OLLAMA_BASE_URL : "https://integrate.api.nvidia.com/v1";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";

// Model name mapping: NVIDIA API name -> Ollama name
const OLLAMA_MODEL_MAP: Record<string, string> = {
  "nvidia/nemotron-3-nano-30b-a3b": "nemotron-3-nano",
};

// Available Models - Streamlined for agents and coding
export const NVIDIA_MODELS = {
  // Nemotron 3 Nano - Main agent model, 1M context
  "nvidia/nemotron-3-nano-30b-a3b": {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    ollamaId: "nemotron-3-nano",
    name: "Nemotron 3 Nano",
    description: "31.6B params, 3.6B active, 1M context, reasoning ON/OFF",
    contextWindow: 1000000,
    maxTokens: 32768,
    supportsTools: true,
    supportsImages: false,
    supportsStreaming: true,
    supportsParallelReasoning: true,
    supportsThinkingBudget: true,
    disabled: false,
  },
  // Embedding Model - For RAG vector search
  "nvidia/llama-3.2-nv-embedqa-1b-v2": {
    id: "nvidia/llama-3.2-nv-embedqa-1b-v2",
    name: "NV EmbedQA 1B",
    description: "1B embedding model for RAG retrieval",
    contextWindow: 8192,
    maxTokens: 0,
    supportsTools: false,
    supportsImages: false,
    supportsStreaming: false,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
    disabled: false,
  },
  // Reranker Model - For RAG result reranking
  "nvidia/llama-3.2-nv-rerankqa-1b-v2": {
    id: "nvidia/llama-3.2-nv-rerankqa-1b-v2",
    name: "NV RerankQA 1B",
    description: "1B reranker model for RAG result ordering",
    contextWindow: 8192,
    maxTokens: 0,
    supportsTools: false,
    supportsImages: false,
    supportsStreaming: false,
    supportsParallelReasoning: false,
    supportsThinkingBudget: false,
    disabled: false,
  },
  // Vision Model - For screenshots and diagrams
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
    disabled: false,
  },
} as const;

export type ModelId = keyof typeof NVIDIA_MODELS;

// Create OpenAI-compatible client for NVIDIA NIM or Ollama
export function createNvidiaClient(apiKey?: string) {
  return new OpenAI({
    baseURL: NVIDIA_API_BASE,
    apiKey: USE_LOCAL_LLM ? "ollama" : (apiKey || NVIDIA_API_KEY),
  });
}

// Get the correct model name for the current backend
export function getModelName(model: ModelId): string {
  if (USE_LOCAL_LLM && OLLAMA_MODEL_MAP[model]) {
    return OLLAMA_MODEL_MAP[model];
  }
  return model;
}

// Check if using local LLM
export function isUsingLocalLLM(): boolean {
  return USE_LOCAL_LLM;
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
  const reasoningParams = USE_LOCAL_LLM ? undefined : buildReasoningParams(options, modelConfig);

  const response = await client.chat.completions.create({
    model: getModelName(options.model),
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
  const reasoningParams = USE_LOCAL_LLM ? undefined : buildReasoningParams(options, modelConfig);

  const stream = await client.chat.completions.create({
    model: getModelName(options.model),
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
