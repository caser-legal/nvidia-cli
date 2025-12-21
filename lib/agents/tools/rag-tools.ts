/**
 * RAG Tools for Agent System
 * Integrates NVIDIA RAG capabilities with the agent tool system
 */

import { Tool, ToolDefinition } from '../types';
import { RAGPipeline } from '../rag';

// Singleton RAG pipeline instance
let ragPipeline: RAGPipeline | null = null;

function getRAGPipeline(): RAGPipeline {
  if (!ragPipeline) {
    ragPipeline = new RAGPipeline({
      embeddingModel: 'nvidia/llama-3.2-nv-embedqa-1b-v2',
      rerankModel: 'nvidia/llama-3.2-nv-rerankqa-1b-v2',
      rerankTopN: 5,
      topK: 10,
      scoreThreshold: 0.3,
      enableReflection: true,
      maxReflectionLoops: 2,
      enableDecomposition: true,
      llmModel: 'nvidia/nemotron-3-nano-30b-a3b',
    });
  }
  return ragPipeline;
}

function createToolDefinition(name: string, description: string, parameters: Record<string, unknown>): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: parameters,
        required: Object.keys(parameters).filter(k => {
          const param = parameters[k] as { required?: boolean };
          return param.required !== false;
        }),
      },
    },
  };
}

/**
 * RAG Ingest Tool
 */
export const RAGIngestTool: Tool = {
  name: 'rag_ingest',
  description: `Ingest documents into the RAG knowledge base for later retrieval.
Parameters: documents (array of {id, content, metadata})`,
  parameters: {
    documents: {
      type: 'array',
      description: 'Documents to ingest',
      required: true,
    },
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const documents = args.documents as { id: string; content: string; metadata?: Record<string, unknown> }[];
      const pipeline = getRAGPipeline();
      await pipeline.ingest(documents);
      
      return JSON.stringify({
        success: true,
        message: `Ingested ${documents.length} document(s)`,
        totalDocuments: pipeline.getDocumentCount(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_ingest', 'Ingest documents into RAG knowledge base', {
    documents: { type: 'array', description: 'Documents to ingest' },
  }),
};

/**
 * RAG Search Tool
 */
export const RAGSearchTool: Tool = {
  name: 'rag_search',
  description: `Search the RAG knowledge base with NVIDIA embeddings and reranking.
Parameters: query (string), top_k (number, optional)`,
  parameters: {
    query: { type: 'string', description: 'Search query', required: true },
    top_k: { type: 'number', description: 'Number of results', required: false },
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const query = args.query as string;
      const topK = (args.top_k as number) || 5;
      const pipeline = getRAGPipeline();
      const result = await pipeline.search(query);
      
      const topDocs = result.documents.slice(0, topK);
      
      return JSON.stringify({
        success: true,
        query,
        totalFound: result.totalFound,
        reranked: result.reranked,
        documents: topDocs.map(d => ({
          id: d.id,
          content: d.content.slice(0, 500) + (d.content.length > 500 ? '...' : ''),
          score: d.metadata.relevanceScore,
          source: d.metadata.source,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_search', 'Search RAG knowledge base', {
    query: { type: 'string', description: 'Search query' },
    top_k: { type: 'number', description: 'Number of results' },
  }),
};

/**
 * RAG Query Tool
 */
export const RAGQueryTool: Tool = {
  name: 'rag_query',
  description: `Query the RAG knowledge base and generate an answer with reflection.
Parameters: query (string), system_prompt (string, optional)`,
  parameters: {
    query: { type: 'string', description: 'Question to answer', required: true },
    system_prompt: { type: 'string', description: 'System prompt', required: false },
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const query = args.query as string;
      const systemPrompt = args.system_prompt as string | undefined;
      const pipeline = getRAGPipeline();
      const result = await pipeline.generate(query, systemPrompt);
      
      return JSON.stringify({
        success: true,
        answer: result.answer,
        sources: result.sources.map(s => ({
          id: s.id,
          source: s.metadata.source,
          score: s.metadata.relevanceScore,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_query', 'Query RAG and generate answer', {
    query: { type: 'string', description: 'Question to answer' },
    system_prompt: { type: 'string', description: 'System prompt' },
  }),
};

/**
 * RAG Research Tool
 */
export const RAGResearchTool: Tool = {
  name: 'rag_research',
  description: `Run comprehensive research workflow with query decomposition and reflection.
Parameters: topic (string), max_iterations (number, optional)`,
  parameters: {
    topic: { type: 'string', description: 'Research topic', required: true },
    max_iterations: { type: 'number', description: 'Max iterations', required: false },
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const topic = args.topic as string;
      const pipeline = getRAGPipeline();
      const result = await pipeline.research(topic);
      
      return JSON.stringify({
        success: true,
        report: result.report,
        citations: result.citations,
        queriesUsed: result.queries.map(q => q.query),
        iterations: result.iterations,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_research', 'Run research workflow', {
    topic: { type: 'string', description: 'Research topic' },
    max_iterations: { type: 'number', description: 'Max iterations' },
  }),
};

/**
 * RAG Clear Tool
 */
export const RAGClearTool: Tool = {
  name: 'rag_clear',
  description: 'Clear all documents from the RAG knowledge base.',
  parameters: {},
  execute: async (): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      const countBefore = pipeline.getDocumentCount();
      pipeline.clear();
      
      return JSON.stringify({
        success: true,
        message: `Cleared ${countBefore} document(s)`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_clear', 'Clear RAG knowledge base', {}),
};

/**
 * RAG Stats Tool
 */
export const RAGStatsTool: Tool = {
  name: 'rag_stats',
  description: 'Get statistics about the RAG knowledge base.',
  parameters: {},
  execute: async (): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      
      return JSON.stringify({
        success: true,
        documentCount: pipeline.getDocumentCount(),
        config: {
          embeddingModel: 'nvidia/llama-3.2-nv-embedqa-1b-v2',
          rerankModel: 'nvidia/llama-3.2-nv-rerankqa-1b-v2',
          reflectionEnabled: true,
          decompositionEnabled: true,
        },
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  toDefinition: () => createToolDefinition('rag_stats', 'Get RAG statistics', {}),
};

// Export all RAG tools
export const RAGTools = [
  RAGIngestTool,
  RAGSearchTool,
  RAGQueryTool,
  RAGResearchTool,
  RAGClearTool,
  RAGStatsTool,
];
