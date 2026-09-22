/**
 * NVIDIA RAG Configuration
 * Based on NVIDIA RAG Blueprint and Enterprise Best Practices (Dec 2025)
 * 
 * This file centralizes all RAG configuration following NVIDIA's recommendations:
 * - Chunking: 600-800 chars with 120 overlap (RecursiveCharacterTextSplitter pattern)
 * - Retrieval: Wide net (100 chunks) then rerank to top 5-10
 * - Models: NV-EmbedQA + NV-RerankQA (ContextualCompressionRetriever pattern)
 */

// ============================================================================
// CHUNKING CONFIGURATION (NVIDIA RAG Blueprint)
// ============================================================================

export interface ChunkingConfig {
  /** Maximum characters per chunk. NVIDIA recommends 100-600 for most use cases */
  chunkSize: number;
  /** Overlap between chunks to preserve context at boundaries */
  chunkOverlap: number;
  /** Separators for recursive splitting (code-aware) */
  separators: string[];
  /** Minimum chunk size to keep (avoid tiny fragments) */
  minChunkSize: number;
}

/**
 * Default chunking config optimized for iOS/Swift code
 * Based on NVIDIA RAG Blueprint recommendations
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  // NVIDIA recommends 100-600, we use 800 for code (more context needed)
  chunkSize: 800,
  // NVIDIA uses 120 overlap - preserves context at boundaries
  chunkOverlap: 120,
  // Code-aware separators (Swift/iOS optimized)
  separators: [
    // Swift structural boundaries (highest priority)
    '\nclass ',
    '\nstruct ',
    '\nenum ',
    '\nprotocol ',
    '\nextension ',
    '\nfunc ',
    '\nvar ',
    '\nlet ',
    // SwiftUI specific
    '\nstruct.*: View',
    '\n@main',
    '\n@Observable',
    '\n@State',
    '\n@Binding',
    // General code boundaries
    '\n\n\n',  // Triple newline (section break)
    '\n\n',    // Double newline (paragraph)
    '\n',      // Single newline
    ' ',       // Space (last resort)
  ],
  minChunkSize: 50,
};

/**
 * Chunking config for documentation/markdown
 */
export const DOCS_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 600,
  chunkOverlap: 100,
  separators: [
    '\n## ',   // H2 headers
    '\n### ',  // H3 headers
    '\n#### ', // H4 headers
    '\n\n',    // Paragraphs
    '\n',      // Lines
    '. ',      // Sentences
    ' ',       // Words
  ],
  minChunkSize: 50,
};

// ============================================================================
// RETRIEVAL CONFIGURATION (NVIDIA RAG Blueprint)
// ============================================================================

export interface RetrievalConfig {
  /** Number of chunks to retrieve from vector DB (wide net) */
  initialTopK: number;
  /** Number of chunks after reranking (narrow down) */
  rerankTopK: number;
  /** Minimum similarity score to include (0-1) */
  scoreThreshold: number;
  /** Enable reranking step */
  enableReranking: boolean;
  /** Enable query decomposition for complex queries */
  enableDecomposition: boolean;
  /** Enable reflection/self-correction loop */
  enableReflection: boolean;
  /** Max reflection iterations */
  maxReflectionLoops: number;
}

/**
 * Default retrieval config following NVIDIA ContextualCompressionRetriever pattern
 * Wide net (100) → Rerank → Narrow (10)
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  // Cast wide net - retrieve many candidates
  initialTopK: 100,
  // Rerank narrows to most relevant
  rerankTopK: 10,
  // No threshold - let reranker handle relevance
  scoreThreshold: 0.0,
  // Always rerank for quality
  enableReranking: true,
  // Decompose complex queries
  enableDecomposition: true,
  // Self-correction for accuracy
  enableReflection: true,
  maxReflectionLoops: 2,
};

/**
 * Fast retrieval config (lower latency, slightly lower quality)
 */
export const FAST_RETRIEVAL_CONFIG: RetrievalConfig = {
  initialTopK: 30,
  rerankTopK: 5,
  scoreThreshold: 0.3,
  enableReranking: true,
  enableDecomposition: false,
  enableReflection: false,
  maxReflectionLoops: 0,
};

// ============================================================================
// MODEL CONFIGURATION (NVIDIA NIM)
// ============================================================================

export interface ModelConfig {
  /** Embedding model ID */
  embeddingModel: string;
  /** Reranking model ID */
  rerankModel: string;
  /** LLM for generation */
  llmModel: string;
  /** Vision model for UI analysis */
  visionModel: string;
}

/**
 * Default NVIDIA model stack
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  // NVIDIA NeMo Retriever Embedding - optimized for QA
  embeddingModel: 'nvidia/llama-3.2-nv-embedqa-1b-v2',
  // NVIDIA NeMo Retriever Reranking - optimized for QA
  rerankModel: 'nvidia/llama-3.2-nv-rerankqa-1b-v2',
  // Nemotron 3 Nano - 1M context, MoE architecture
  llmModel: 'nvidia/nemotron-3-nano-30b-a3b',
  // Nemotron Nano VL - Vision-language for UI analysis
  visionModel: 'nvidia/nemotron-nano-12b-v2-vl',
};

// ============================================================================
// USE CASE PROFILES (Based on NVIDIA RAG Blueprint)
// ============================================================================

export interface RAGProfile {
  name: string;
  description: string;
  chunking: ChunkingConfig;
  retrieval: RetrievalConfig;
  models: ModelConfig;
}

/**
 * iOS Development Profile
 * Optimized for large Swift/SwiftUI codebases
 */
export const IOS_DEVELOPMENT_PROFILE: RAGProfile = {
  name: 'iOS Development',
  description: 'Optimized for large iOS/SwiftUI codebases (100k+ lines)',
  chunking: {
    chunkSize: 800,
    chunkOverlap: 120,
    separators: [
      '\nclass ', '\nstruct ', '\nenum ', '\nprotocol ', '\nextension ',
      '\nfunc ', '\n@main', '\n@Observable', '\n\n\n', '\n\n', '\n', ' ',
    ],
    minChunkSize: 50,
  },
  retrieval: {
    initialTopK: 100,
    rerankTopK: 10,
    scoreThreshold: 0.0,
    enableReranking: true,
    enableDecomposition: true,
    enableReflection: true,
    maxReflectionLoops: 2,
  },
  models: DEFAULT_MODEL_CONFIG,
};

/**
 * Research Agent Profile
 * Based on NVIDIA's research agent SLA (ISL/OSL 512/4096, CR=25, e2e<120s)
 */
export const RESEARCH_AGENT_PROFILE: RAGProfile = {
  name: 'Research Agent',
  description: 'Deep research with longer context and more thorough retrieval',
  chunking: {
    chunkSize: 1000,
    chunkOverlap: 150,
    separators: ['\n## ', '\n### ', '\n\n', '\n', '. ', ' '],
    minChunkSize: 100,
  },
  retrieval: {
    initialTopK: 150,
    rerankTopK: 15,
    scoreThreshold: 0.0,
    enableReranking: true,
    enableDecomposition: true,
    enableReflection: true,
    maxReflectionLoops: 3,
  },
  models: DEFAULT_MODEL_CONFIG,
};

/**
 * Customer Chatbot Profile
 * Based on NVIDIA's chatbot SLA (ISL/OSL 256/256, TTFT<2s, e2e<20s)
 */
export const CHATBOT_PROFILE: RAGProfile = {
  name: 'Customer Chatbot',
  description: 'Fast responses with strict latency requirements',
  chunking: {
    chunkSize: 500,
    chunkOverlap: 80,
    separators: ['\n\n', '\n', '. ', ' '],
    minChunkSize: 30,
  },
  retrieval: {
    initialTopK: 50,
    rerankTopK: 5,
    scoreThreshold: 0.2,
    enableReranking: true,
    enableDecomposition: false,
    enableReflection: false,
    maxReflectionLoops: 0,
  },
  models: DEFAULT_MODEL_CONFIG,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get profile by name
 */
export function getRAGProfile(name: string): RAGProfile {
  const profiles: Record<string, RAGProfile> = {
    'ios': IOS_DEVELOPMENT_PROFILE,
    'ios-development': IOS_DEVELOPMENT_PROFILE,
    'research': RESEARCH_AGENT_PROFILE,
    'research-agent': RESEARCH_AGENT_PROFILE,
    'chatbot': CHATBOT_PROFILE,
    'customer-chatbot': CHATBOT_PROFILE,
  };
  
  return profiles[name.toLowerCase()] || IOS_DEVELOPMENT_PROFILE;
}

/**
 * Estimate tokens from character count
 * Rule of thumb: ~4 chars per token for English, ~3 for code
 */
export function estimateTokens(chars: number, isCode: boolean = false): number {
  return Math.ceil(chars / (isCode ? 3 : 4));
}

/**
 * Calculate optimal chunk size based on model context window
 * Leaves room for query + response
 */
export function calculateOptimalChunkSize(
  contextWindow: number,
  maxChunksInContext: number = 10,
  queryReserve: number = 1000,
  responseReserve: number = 4000
): number {
  const availableTokens = contextWindow - queryReserve - responseReserve;
  const tokensPerChunk = Math.floor(availableTokens / maxChunksInContext);
  // Convert tokens to chars (assuming code)
  return tokensPerChunk * 3;
}
