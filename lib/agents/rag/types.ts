/**
 * RAG System Types
 * Based on NVIDIA RAG Blueprint and Course Materials
 */

export interface EmbeddingConfig {
  provider: 'nvidia' | 'openai' | 'local';
  model: string;
  dimensions?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface RerankConfig {
  provider: 'nvidia' | 'cohere';
  model: string;
  topN: number;
  apiKey?: string;
}

export interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

export interface Document {
  id: string;
  content: string;
  metadata: {
    source: string;
    title?: string;
    relevanceScore?: number;
    chunkIndex?: number;
    totalChunks?: number;
    [key: string]: unknown;
  };
}

export interface SearchResult {
  documents: Document[];
  query: string;
  reranked: boolean;
  totalFound: number;
}

export interface RAGConfig {
  embedding: EmbeddingConfig;
  rerank?: RerankConfig;
  chunk: ChunkConfig;
  topK: number;
  scoreThreshold: number;
  collectionName: string;
}

// Query decomposition types
export interface SubQuery {
  query: string;
  rationale: string;
  section?: string;
}

export interface DecomposedQuery {
  originalQuery: string;
  subQueries: SubQuery[];
  needsDecomposition: boolean;
}

// Reflection types
export interface ReflectionResult {
  isRelevant: boolean;
  isGrounded: boolean;
  score: number;
  feedback?: string;
  rewrittenQuery?: string;
}

// Workflow state types (LangGraph-inspired)
export interface WorkflowState {
  query: string;
  context: Document[];
  subQueries?: SubQuery[];
  answers?: Map<string, string>;
  finalAnswer?: string;
  reflectionResults?: ReflectionResult[];
  iteration: number;
  maxIterations: number;
  status: 'pending' | 'researching' | 'reflecting' | 'generating' | 'complete' | 'error';
  error?: string;
}

export type WorkflowNode = (state: WorkflowState) => Promise<WorkflowState>;

export interface WorkflowEdge {
  from: string;
  to: string | ((state: WorkflowState) => string);
  condition?: (state: WorkflowState) => boolean;
}

export interface WorkflowGraph {
  nodes: Map<string, WorkflowNode>;
  edges: WorkflowEdge[];
  entryPoint: string;
}
