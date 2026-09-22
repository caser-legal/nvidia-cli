/**
 * Recursive Character Text Splitter
 * Based on NVIDIA RAG Blueprint and LangChain's RecursiveCharacterTextSplitter
 */

import { ChunkingConfig, DEFAULT_CHUNKING_CONFIG } from './config';
import { createLogger } from '../../logger';

const log = createLogger("TextSplitter");

export interface TextChunk {
  content: string;
  metadata: { chunkIndex: number; totalChunks: number; startChar: number; endChar: number; source?: string; [key: string]: unknown };
}

export interface SplitDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class RecursiveCharacterTextSplitter {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  splitText(text: string, metadata?: Record<string, unknown>): TextChunk[] {
    if (!text || text.trim().length === 0) return [];

    const chunks = this.recursiveSplit(text, this.config.separators);
    const totalChunks = chunks.length;

    return chunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: { ...metadata, chunkIndex: index, totalChunks, startChar: chunk.startChar, endChar: chunk.endChar },
    }));
  }

  splitDocuments(documents: SplitDocument[]): SplitDocument[] {
    const result: SplitDocument[] = [];

    for (const doc of documents) {
      if (!doc || !doc.content || doc.content.trim().length === 0) {
        log.warn(`Skipping empty document: ${doc?.id}`);
        continue;
      }

      const chunks = this.splitText(doc.content, doc.metadata);
      for (const chunk of chunks) {
        result.push({
          id: `${doc.id}_chunk_${chunk.metadata.chunkIndex}`,
          content: chunk.content,
          metadata: { ...doc.metadata, ...chunk.metadata, originalId: doc.id },
        });
      }
    }

    return result;
  }

  private recursiveSplit(text: string, separators: string[], startOffset: number = 0): { content: string; startChar: number; endChar: number }[] {
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;

    if (text.length <= chunkSize) {
      if (text.trim().length < minChunkSize) return [];
      return [{ content: text.trim(), startChar: startOffset, endChar: startOffset + text.length }];
    }

    let separator = '';
    let nextSeparators = separators;

    for (let i = 0; i < separators.length; i++) {
      const sep = separators[i];
      if (text.includes(sep)) {
        separator = sep;
        nextSeparators = separators.slice(i + 1);
        break;
      }
    }

    if (!separator) return this.splitBySize(text, startOffset);

    const splits = this.splitBySeparator(text, separator);
    const chunks: { content: string; startChar: number; endChar: number }[] = [];
    let currentChunk = '';
    let currentStart = startOffset;
    let runningOffset = startOffset;

    for (const split of splits) {
      const potentialChunk = currentChunk + (currentChunk ? separator : '') + split;

      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk.trim().length >= minChunkSize) {
          chunks.push({ content: currentChunk.trim(), startChar: currentStart, endChar: runningOffset });
        }

        if (split.length > chunkSize) {
          const subChunks = this.recursiveSplit(split, nextSeparators, runningOffset);
          chunks.push(...subChunks);
          currentChunk = '';
          currentStart = runningOffset + split.length;
        } else {
          const overlapText = this.getOverlapText(currentChunk, chunkOverlap);
          currentChunk = overlapText + split;
          currentStart = runningOffset - overlapText.length;
        }
      }

      runningOffset += split.length + separator.length;
    }

    if (currentChunk.trim().length >= minChunkSize) {
      chunks.push({ content: currentChunk.trim(), startChar: currentStart, endChar: runningOffset });
    }

    return chunks;
  }

  private splitBySeparator(text: string, separator: string): string[] {
    if (!separator) return [text];
    const parts = text.split(separator);
    const result: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (i === 0) result.push(parts[i]);
      else {
        const prefix = separator.trim() ? separator : '';
        result.push(prefix + parts[i]);
      }
    }

    return result.filter(p => p.length > 0);
  }

  private splitBySize(text: string, startOffset: number): { content: string; startChar: number; endChar: number }[] {
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;
    const chunks: { content: string; startChar: number; endChar: number }[] = [];

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();

      if (chunk.length >= minChunkSize) {
        chunks.push({ content: chunk, startChar: startOffset + start, endChar: startOffset + end });
      }

      start = end - chunkOverlap;
      if (start >= text.length - minChunkSize) break;
    }

    return chunks;
  }

  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text;
    const overlapStart = text.length - overlapSize;
    const overlap = text.slice(overlapStart);
    const firstSpace = overlap.indexOf(' ');
    if (firstSpace > 0 && firstSpace < overlapSize / 2) return overlap.slice(firstSpace + 1);
    return overlap;
  }

  getConfig(): ChunkingConfig { return { ...this.config }; }
}

export class SwiftTextSplitter extends RecursiveCharacterTextSplitter {
  constructor(config: Partial<ChunkingConfig> = {}) {
    super({
      chunkSize: 800, chunkOverlap: 120, minChunkSize: 50,
      separators: ['\n@main', '\nclass ', '\nstruct ', '\nenum ', '\nprotocol ', '\nextension ', '\nactor ', '\n@Observable', '\n@State ', '\n@Binding ', '\n@Environment', '\n@Published ', '\n    func ', '\nfunc ', '\n    var ', '\n    let ', '\nvar ', '\nlet ', '\nimport ', '\n// MARK:', '\n// MARK: -', '\n\n\n', '\n\n', '\n', ' '],
      ...config,
    });
  }
}

export class MarkdownTextSplitter extends RecursiveCharacterTextSplitter {
  constructor(config: Partial<ChunkingConfig> = {}) {
    super({
      chunkSize: 600, chunkOverlap: 100, minChunkSize: 50,
      separators: ['\n# ', '\n## ', '\n### ', '\n#### ', '\n##### ', '\n```', '\n---', '\n\n', '\n', '. ', ' '],
      ...config,
    });
  }
}
