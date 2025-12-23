/**
 * Recursive Character Text Splitter
 * Based on NVIDIA RAG Blueprint and LangChain's RecursiveCharacterTextSplitter
 * 
 * Key features:
 * - Recursively splits on semantic boundaries (class, function, paragraph)
 * - Preserves context with configurable overlap
 * - Code-aware splitting for Swift/iOS
 * - Metadata preservation for source tracking
 */

import { ChunkingConfig, DEFAULT_CHUNKING_CONFIG } from './config';

export interface TextChunk {
  content: string;
  metadata: {
    chunkIndex: number;
    totalChunks: number;
    startChar: number;
    endChar: number;
    source?: string;
    [key: string]: unknown;
  };
}

export interface SplitDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * RecursiveCharacterTextSplitter
 * Splits text recursively using a hierarchy of separators
 * Based on NVIDIA RAG Blueprint chunking strategy
 */
export class RecursiveCharacterTextSplitter {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  /**
   * Split a single text into chunks
   */
  splitText(text: string, metadata?: Record<string, unknown>): TextChunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = this.recursiveSplit(text, this.config.separators);
    const totalChunks = chunks.length;

    return chunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
      },
    }));
  }

  /**
   * Split multiple documents into chunks
   */
  splitDocuments(documents: SplitDocument[]): SplitDocument[] {
    const result: SplitDocument[] = [];

    for (const doc of documents) {
      if (!doc || !doc.content || doc.content.trim().length === 0) {
        console.warn(`[TextSplitter] Skipping empty document: ${doc?.id}`);
        continue;
      }

      const chunks = this.splitText(doc.content, doc.metadata);

      for (const chunk of chunks) {
        result.push({
          id: `${doc.id}_chunk_${chunk.metadata.chunkIndex}`,
          content: chunk.content,
          metadata: {
            ...doc.metadata,
            ...chunk.metadata,
            originalId: doc.id,
          },
        });
      }
    }

    return result;
  }

  /**
   * Recursive splitting algorithm
   * Tries each separator in order, falling back to next if chunks are still too large
   */
  private recursiveSplit(
    text: string,
    separators: string[],
    startOffset: number = 0
  ): { content: string; startChar: number; endChar: number }[] {
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;

    // Base case: text fits in one chunk
    if (text.length <= chunkSize) {
      if (text.trim().length < minChunkSize) {
        return [];
      }
      return [{
        content: text.trim(),
        startChar: startOffset,
        endChar: startOffset + text.length,
      }];
    }

    // Find the best separator for this text
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

    // If no separator found, fall back to character splitting
    if (!separator) {
      return this.splitBySize(text, startOffset);
    }

    // Split by separator
    const splits = this.splitBySeparator(text, separator);
    const chunks: { content: string; startChar: number; endChar: number }[] = [];
    let currentChunk = '';
    let currentStart = startOffset;
    let runningOffset = startOffset;

    for (const split of splits) {
      const potentialChunk = currentChunk + (currentChunk ? separator : '') + split;

      if (potentialChunk.length <= chunkSize) {
        // Add to current chunk
        currentChunk = potentialChunk;
      } else {
        // Current chunk is full
        if (currentChunk.trim().length >= minChunkSize) {
          chunks.push({
            content: currentChunk.trim(),
            startChar: currentStart,
            endChar: runningOffset,
          });
        }

        // Check if split itself is too large
        if (split.length > chunkSize) {
          // Recursively split the large piece
          const subChunks = this.recursiveSplit(split, nextSeparators, runningOffset);
          chunks.push(...subChunks);
          currentChunk = '';
          currentStart = runningOffset + split.length;
        } else {
          // Start new chunk with overlap
          const overlapText = this.getOverlapText(currentChunk, chunkOverlap);
          currentChunk = overlapText + split;
          currentStart = runningOffset - overlapText.length;
        }
      }

      runningOffset += split.length + separator.length;
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length >= minChunkSize) {
      chunks.push({
        content: currentChunk.trim(),
        startChar: currentStart,
        endChar: runningOffset,
      });
    }

    return chunks;
  }

  /**
   * Split text by a separator, keeping the separator with the following text
   */
  private splitBySeparator(text: string, separator: string): string[] {
    if (!separator) {
      return [text];
    }

    // For code separators like '\nclass ', keep the separator with the next chunk
    const parts = text.split(separator);
    const result: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        result.push(parts[i]);
      } else {
        // Prepend separator to subsequent parts (except for whitespace-only separators)
        const prefix = separator.trim() ? separator : '';
        result.push(prefix + parts[i]);
      }
    }

    return result.filter(p => p.length > 0);
  }

  /**
   * Fall back to simple size-based splitting
   */
  private splitBySize(
    text: string,
    startOffset: number
  ): { content: string; startChar: number; endChar: number }[] {
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;
    const chunks: { content: string; startChar: number; endChar: number }[] = [];

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();

      if (chunk.length >= minChunkSize) {
        chunks.push({
          content: chunk,
          startChar: startOffset + start,
          endChar: startOffset + end,
        });
      }

      // Move forward with overlap
      start = end - chunkOverlap;
      if (start >= text.length - minChunkSize) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text;
    }

    // Try to break at a word boundary
    const overlapStart = text.length - overlapSize;
    const overlap = text.slice(overlapStart);

    // Find first space to avoid breaking mid-word
    const firstSpace = overlap.indexOf(' ');
    if (firstSpace > 0 && firstSpace < overlapSize / 2) {
      return overlap.slice(firstSpace + 1);
    }

    return overlap;
  }

  /**
   * Get configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }
}

/**
 * Swift/iOS-optimized text splitter
 * Pre-configured for Swift code structure
 */
export class SwiftTextSplitter extends RecursiveCharacterTextSplitter {
  constructor(config: Partial<ChunkingConfig> = {}) {
    super({
      chunkSize: 800,
      chunkOverlap: 120,
      minChunkSize: 50,
      separators: [
        // Swift type declarations (highest priority - keep types together)
        '\n@main',
        '\nclass ',
        '\nstruct ',
        '\nenum ',
        '\nprotocol ',
        '\nextension ',
        '\nactor ',
        // SwiftUI property wrappers
        '\n@Observable',
        '\n@State ',
        '\n@Binding ',
        '\n@Environment',
        '\n@Published ',
        // Function declarations
        '\n    func ',
        '\nfunc ',
        '\n    var ',
        '\n    let ',
        '\nvar ',
        '\nlet ',
        // Import statements
        '\nimport ',
        // MARK comments (section dividers)
        '\n// MARK:',
        '\n// MARK: -',
        // General boundaries
        '\n\n\n',
        '\n\n',
        '\n',
        ' ',
      ],
      ...config,
    });
  }
}

/**
 * Markdown/documentation text splitter
 */
export class MarkdownTextSplitter extends RecursiveCharacterTextSplitter {
  constructor(config: Partial<ChunkingConfig> = {}) {
    super({
      chunkSize: 600,
      chunkOverlap: 100,
      minChunkSize: 50,
      separators: [
        '\n# ',     // H1
        '\n## ',    // H2
        '\n### ',   // H3
        '\n#### ',  // H4
        '\n##### ', // H5
        '\n```',    // Code blocks
        '\n---',    // Horizontal rules
        '\n\n',     // Paragraphs
        '\n',       // Lines
        '. ',       // Sentences
        ' ',        // Words
      ],
      ...config,
    });
  }
}
