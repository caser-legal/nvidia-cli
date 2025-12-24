/**
 * Reflection System
 * Based on NVIDIA RAG Blueprint reflection.py
 */

import { ReflectionResult, Document } from './types';
import { createLogger } from '../../logger';

const log = createLogger("Reflection");

export class ReflectionSystem {
  private llmEndpoint: string;
  private model: string;
  private relevanceThreshold: number;
  private groundednessThreshold: number;

  constructor(llmEndpoint: string = 'https://integrate.api.nvidia.com/v1', model: string = 'nvidia/nemotron-3-nano-30b-a3b', relevanceThreshold: number = 1, groundednessThreshold: number = 1) {
    this.llmEndpoint = llmEndpoint;
    this.model = model;
    this.relevanceThreshold = relevanceThreshold;
    this.groundednessThreshold = groundednessThreshold;
  }

  async checkContextRelevance(query: string, documents: Document[]): Promise<ReflectionResult> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return { isRelevant: true, isGrounded: true, score: 2 };

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = `You are evaluating whether retrieved context is relevant to a query.\n\nQuery: ${query}\n\nContext:\n${contextText.slice(0, 16000)}\n\nRate the relevance on a scale of 0-2:\n- 0: Not relevant\n- 1: Partially relevant\n- 2: Highly relevant\n\nRespond with JSON:\n{"score": 0|1|2, "reasoning": "brief explanation"}`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: 'You are a relevance evaluator. Always respond with valid JSON.' }, { role: 'user', content: prompt }], temperature: 0, max_tokens: 512 }),
      });

      if (!response.ok) return { isRelevant: true, isGrounded: true, score: 2 };

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { isRelevant: parsed.score >= this.relevanceThreshold, isGrounded: true, score: parsed.score, feedback: parsed.reasoning };
      }
    } catch (error) {
      log.error('Relevance check failed', { error: String(error) });
    }

    return { isRelevant: true, isGrounded: true, score: 2 };
  }

  async checkResponseGroundedness(response: string, documents: Document[]): Promise<ReflectionResult> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return { isRelevant: true, isGrounded: true, score: 2 };

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = `You are evaluating whether a response is grounded in the provided context.\n\nContext:\n${contextText.slice(0, 16000)}\n\nResponse:\n${response}\n\nRate groundedness on a scale of 0-2:\n- 0: Not grounded\n- 1: Partially grounded\n- 2: Fully grounded\n\nRespond with JSON:\n{"score": 0|1|2, "reasoning": "brief explanation", "unsupportedClaims": ["list"]}`;

    try {
      const fetchResponse = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: 'You are a groundedness evaluator. Always respond with valid JSON.' }, { role: 'user', content: prompt }], temperature: 0, max_tokens: 1024 }),
      });

      if (!fetchResponse.ok) return { isRelevant: true, isGrounded: true, score: 2 };

      const data = await fetchResponse.json();
      const content = data.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { isRelevant: true, isGrounded: parsed.score >= this.groundednessThreshold, score: parsed.score, feedback: parsed.reasoning };
      }
    } catch (error) {
      log.error('Groundedness check failed', { error: String(error) });
    }

    return { isRelevant: true, isGrounded: true, score: 2 };
  }

  async rewriteQueryForRelevance(query: string, documents: Document[]): Promise<string> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return query;

    const contextText = documents.map(d => d.content).join('\n\n').slice(0, 2000);
    const prompt = `The following query did not retrieve relevant context. Rewrite it to be more specific.\n\nOriginal Query: ${query}\n\nRetrieved Context (not relevant):\n${contextText}\n\nRewritten Query:`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 256 }),
      });

      if (!response.ok) return query;
      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || query;
    } catch {
      return query;
    }
  }

  async regenerateResponse(query: string, documents: Document[], previousResponse: string): Promise<string | null> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return null;

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = `The following response was not well-grounded. Generate a new response strictly based on the context.\n\nQuery: ${query}\n\nContext:\n${contextText.slice(0, 16000)}\n\nPrevious Response (not well-grounded):\n${previousResponse}\n\nGenerate a new response that only makes claims supported by the context. If the context doesn't contain enough information, say "OUT OF CONTEXT".\n\nNew Response:`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2048 }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}

export class ReflectionCounter {
  private maxLoops: number;
  private currentCount: number = 0;

  constructor(maxLoops: number = 3) { this.maxLoops = maxLoops; }

  increment(): boolean {
    if (this.currentCount >= this.maxLoops) return false;
    this.currentCount++;
    return true;
  }

  get remaining(): number { return Math.max(0, this.maxLoops - this.currentCount); }
  reset(): void { this.currentCount = 0; }
}
