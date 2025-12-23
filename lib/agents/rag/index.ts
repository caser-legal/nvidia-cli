/**
 * RAG System Exports
 * Based on NVIDIA RAG Blueprint (Dec 2025)
 */

// Core pipeline (v2 with NVIDIA best practices)
export { RAGPipelineV2, getRAGPipeline, resetRAGPipeline } from './pipeline-v2';
export type { RAGPipelineV2Config } from './pipeline-v2';

// Legacy pipeline (for backwards compatibility)
export { RAGPipeline } from './pipeline';
export type { RAGPipelineConfig } from './pipeline';

// Configuration
export {
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG,
  DEFAULT_MODEL_CONFIG,
  IOS_DEVELOPMENT_PROFILE,
  RESEARCH_AGENT_PROFILE,
  CHATBOT_PROFILE,
  getRAGProfile,
  estimateTokens,
  calculateOptimalChunkSize,
} from './config';
export type {
  ChunkingConfig,
  RetrievalConfig,
  ModelConfig,
  RAGProfile,
} from './config';

// Text splitting
export {
  RecursiveCharacterTextSplitter,
  SwiftTextSplitter,
  MarkdownTextSplitter,
} from './text-splitter';
export type { TextChunk, SplitDocument } from './text-splitter';

// Retrieval
export {
  ContextualCompressionRetriever,
  AgentControlledRetriever,
} from './contextual-retriever';
export type { RetrievalResult } from './contextual-retriever';

// Hybrid retrieval (BM25 + Vector)
export { BM25Retriever, HybridRetriever } from './hybrid-retriever';

// Embeddings and reranking
export { NVIDIAEmbeddings, NVIDIAReranker, SimpleVectorStore } from './embeddings';

// Query processing
export { QueryDecomposer } from './query-decomposition';

// Reflection
export { ReflectionSystem, ReflectionCounter } from './reflection';

// Research workflow
export { ResearchWorkflow } from './research-workflow';
export type { ResearchResult } from './research-workflow';

// Types
export type {
  Document,
  SearchResult,
  EmbeddingConfig,
  RerankConfig,
  ChunkConfig,
  DecomposedQuery,
  SubQuery,
  ReflectionResult,
  WorkflowState,
} from './types';
