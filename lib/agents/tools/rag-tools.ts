import * as os from "os";
/**
 * RAG Tools for Agent System
 * Integrates NVIDIA RAG capabilities with the agent tool system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolDefinition } from '../types';
import { RAGPipelineV2, getRAGPipeline as getV2Pipeline, IOS_DEVELOPMENT_PROFILE } from '../rag';
import { getCurrentProjectDir } from './project';
import { createLogger } from '../../logger';

const log = createLogger("RAG");

function getRAGPipeline(): RAGPipelineV2 {
  return getV2Pipeline({ profile: IOS_DEVELOPMENT_PROFILE });
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

export const RAGIngestTool: Tool = {
  name: 'rag_ingest',
  description: `Ingest documents into the RAG knowledge base for later retrieval.
Can accept either:
- path: A file or directory path to ingest
- documents: An array of {id, content, metadata} objects`,
  parameters: {
    path: { type: 'string', description: 'File or directory path to ingest', required: false },
    documents: { type: 'array', description: 'Documents to ingest directly', required: false },
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      let documents: { id: string; content: string; metadata?: Record<string, unknown> }[] = [];

      if (args.path) {
        const inputPath = args.path as string;
        const resolvedPath = inputPath.startsWith('/') ? inputPath : inputPath.startsWith('~') ? inputPath.replace(/^~/, process.env.HOME || '') : path.resolve(getCurrentProjectDir(), inputPath);
        
        const stat = await fs.stat(resolvedPath);
        
        if (stat.isFile()) {
          const content = await fs.readFile(resolvedPath, 'utf-8');
          documents.push({ id: resolvedPath, content, metadata: { source: resolvedPath, type: path.extname(resolvedPath) } });
        } else if (stat.isDirectory()) {
          const files = await fs.readdir(resolvedPath);
          for (const file of files) {
            const filePath = path.join(resolvedPath, file);
            const fileStat = await fs.stat(filePath);
            if (fileStat.isFile() && /\.(md|txt|ts|tsx|js|jsx|json)$/i.test(file)) {
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                if (content) documents.push({ id: filePath, content, metadata: { source: filePath, type: path.extname(filePath) } });
              } catch (readError) {
                log.warn(`Skipping file ${filePath}`, { error: String(readError) });
              }
            }
          }
        }
      }
      
      if (args.documents && Array.isArray(args.documents)) {
        const validDocs = (args.documents as typeof documents).filter(doc => doc && typeof doc === 'object' && doc.id && doc.content && typeof doc.content === 'string');
        documents = documents.concat(validDocs);
      }

      documents = documents.filter(doc => doc && doc.id && doc.content && typeof doc.content === 'string' && doc.content.trim().length > 0);

      if (documents.length === 0) return JSON.stringify({ success: false, error: 'No valid documents to ingest. Provide a path or documents array.' });

      await pipeline.ingest(documents);
      return JSON.stringify({ success: true, message: `Ingested ${documents.length} document(s)`, totalDocuments: pipeline.getDocumentCount() });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_ingest', 'Ingest documents into RAG knowledge base. Accepts path (file/directory) or documents array.', {
    path: { type: 'string', description: 'File or directory path to ingest' },
    documents: { type: 'array', description: 'Documents to ingest directly' },
  }),
};

export const RAGSearchTool: Tool = {
  name: 'rag_search',
  description: `Search the RAG knowledge base with NVIDIA embeddings and reranking.
Parameters: query (string), top_k (number, optional)`,
  parameters: { query: { type: 'string', description: 'Search query', required: true }, top_k: { type: 'number', description: 'Number of results', required: false } },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const query = args.query as string;
      const topK = (args.top_k as number) || 5;
      const pipeline = getRAGPipeline();
      const result = await pipeline.search(query);
      const topDocs = result.documents.slice(0, topK);
      return JSON.stringify({ success: true, query, totalFound: result.totalFound, reranked: result.reranked, documents: topDocs.map(d => ({ id: d.id, content: d.content.slice(0, 500) + (d.content.length > 500 ? '...' : ''), score: d.metadata.relevanceScore, source: d.metadata.source })) });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_search', 'Search RAG knowledge base', { query: { type: 'string', description: 'Search query' }, top_k: { type: 'number', description: 'Number of results' } }),
};

export const RAGQueryTool: Tool = {
  name: 'rag_query',
  description: `Query the RAG knowledge base and generate an answer with reflection.
Parameters: query (string), system_prompt (string, optional)`,
  parameters: { query: { type: 'string', description: 'Question to answer', required: true }, system_prompt: { type: 'string', description: 'System prompt', required: false } },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const query = args.query as string;
      const systemPrompt = args.system_prompt as string | undefined;
      const pipeline = getRAGPipeline();
      const result = await pipeline.generate(query, systemPrompt);
      return JSON.stringify({ success: true, answer: result.answer, sources: result.sources.map(s => ({ id: s.id, source: s.metadata.source, score: s.metadata.relevanceScore })) });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_query', 'Query RAG and generate answer', { query: { type: 'string', description: 'Question to answer' }, system_prompt: { type: 'string', description: 'System prompt' } }),
};

export const RAGResearchTool: Tool = {
  name: 'rag_research',
  description: `Run comprehensive research workflow with query decomposition and reflection.
Parameters: topic (string), max_iterations (number, optional)`,
  parameters: { topic: { type: 'string', description: 'Research topic', required: true }, max_iterations: { type: 'number', description: 'Max iterations', required: false } },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const topic = args.topic as string;
      const pipeline = getRAGPipeline();
      const result = await pipeline.research(topic);
      return JSON.stringify({ success: true, report: result.report, citations: result.citations, queriesUsed: result.queries.map(q => q.query), iterations: result.iterations });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_research', 'Run research workflow', { topic: { type: 'string', description: 'Research topic' }, max_iterations: { type: 'number', description: 'Max iterations' } }),
};

export const RAGClearTool: Tool = {
  name: 'rag_clear',
  description: 'Clear all documents from the RAG knowledge base.',
  parameters: {},
  execute: async (): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      const countBefore = pipeline.getDocumentCount();
      pipeline.clear();
      return JSON.stringify({ success: true, message: `Cleared ${countBefore} document(s)` });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_clear', 'Clear RAG knowledge base', {}),
};

export const RAGStatsTool: Tool = {
  name: 'rag_stats',
  description: 'Get statistics about the RAG knowledge base.',
  parameters: {},
  execute: async (): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      const homeDir = process.env.HOME || os.homedir();
      return JSON.stringify({ success: true, documentCount: pipeline.getDocumentCount(), persistentStorage: `${homeDir}/.nvidia-cli/.rag-store.json`, config: { embeddingModel: 'nvidia/llama-3.2-nv-embedqa-1b-v2', rerankModel: 'nvidia/llama-3.2-nv-rerankqa-1b-v2', scoreThreshold: 0.0, reflectionEnabled: true, decompositionEnabled: true, textSearchFallback: true } });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_stats', 'Get RAG statistics', {}),
};

export const RAGValidateTool: Tool = {
  name: 'rag_validate',
  description: `Validate RAG knowledge base - removes stale documents where source files no longer exist.`,
  parameters: {},
  execute: async (): Promise<string> => {
    try {
      const pipeline = getRAGPipeline();
      const result = await pipeline.validate();
      return JSON.stringify({ success: true, message: result.removed > 0 ? `Removed ${result.removed} stale documents. ${result.total} documents remaining.` : `All ${result.total} documents are valid.`, removed: result.removed, remaining: result.total });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_validate', 'Validate RAG - remove stale documents', {}),
};

export const RAGUpdateTool: Tool = {
  name: 'rag_update',
  description: `Update documents in RAG from a path. Removes old documents from that path and re-ingests.`,
  parameters: { path: { type: 'string', description: 'File or directory path to update', required: true } },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const inputPath = args.path as string;
      const resolvedPath = inputPath.startsWith('/') ? inputPath : inputPath.startsWith('~') ? inputPath.replace(/^~/, process.env.HOME || '') : path.resolve(getCurrentProjectDir(), inputPath);
      
      const pipeline = getRAGPipeline();
      const removeResult = await pipeline.update(resolvedPath);
      
      const stat = await fs.stat(resolvedPath);
      const documents: { id: string; content: string; metadata?: Record<string, unknown> }[] = [];
      
      if (stat.isFile()) {
        const content = await fs.readFile(resolvedPath, 'utf-8');
        documents.push({ id: resolvedPath, content, metadata: { source: resolvedPath, type: path.extname(resolvedPath) } });
      } else if (stat.isDirectory()) {
        const files = await fs.readdir(resolvedPath);
        for (const file of files) {
          const filePath = path.join(resolvedPath, file);
          const fileStat = await fs.stat(filePath);
          if (fileStat.isFile() && /\.(md|txt|ts|tsx|js|jsx|json|swift)$/i.test(file)) {
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              if (content) documents.push({ id: filePath, content, metadata: { source: filePath, type: path.extname(filePath) } });
            } catch { /* Skip unreadable files */ }
          }
        }
      }
      
      if (documents.length > 0) await pipeline.ingest(documents);
      
      return JSON.stringify({ success: true, message: `Updated ${resolvedPath}: removed ${removeResult.removed} old, ingested ${documents.length} new`, removed: removeResult.removed, ingested: documents.length, totalDocuments: pipeline.getDocumentCount() });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
  toDefinition: () => createToolDefinition('rag_update', 'Update documents in RAG from path', { path: { type: 'string', description: 'File or directory path to update' } }),
};

export const RAGTools = [RAGIngestTool, RAGSearchTool, RAGQueryTool, RAGResearchTool, RAGClearTool, RAGStatsTool, RAGValidateTool, RAGUpdateTool];
