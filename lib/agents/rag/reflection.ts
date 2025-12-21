/**
 * Reflection System
 * Based on NVIDIA RAG Blueprint reflection.py
 * Checks context relevance and response groundedness
 */

import { ReflectionResult, Document } from './types';

const RELEVANCE_CHECK_PROMPT = `You are evaluating whether retrieved context is relevant to a query.

Query: {query}

Context:
{context}

Rate the relevance of this context to the query on a scale of 0-2:
- 0: Not relevant - the context doesn't help answer the query
- 1: Partially relevant - some useful information but incomplete
- 2: Highly relevant - the context directly addresses the query

Respond with JSON:
{
  "score": 0|1|2,
  "reasoning": "brief explanation"
}`;

const GROUNDEDNESS_CHECK_PROMPT = `You are evaluating whether a response is grounded in the provided context.

Context:
{context}

Response:
{response}

Rate how well the response is grounded in the context on a scale of 0-2:
- 0: Not grounded - contains claims not supported by context
- 1: Partially grounded - some claims supported, some not
- 2: Fully grounded - all claims are supported by context

Respond with JSON:
{
  "score": 0|1|2,
  "reasoning": "brief explanation",
  "unsupportedClaims": ["list of claims not in context"]
}`;

const QUERY_REWRITE_FOR_RELEVANCE_PROMPT = `The following query did not retrieve relevant context. Rewrite it to be more specific and likely to find relevant information.

Original Query: {query}

Retrieved Context (not relevant):
{context}

Rewrite the query to be more specific. Focus on key terms and concepts that might appear in relevant documents.

Rewritten Query:`;

export class ReflectionSystem {
  private llmEndpoint: string;
  private model: string;
  private relevanceThreshold: number;
  private groundednessThreshold: number;

  constructor(
    llmEndpoint: string = 'https://integrate.api.nvidia.com/v1',
    model: string = 'nvidia/nemotron-3-nano-30b-a3b',
    relevanceThreshold: number = 1,
    groundednessThreshold: number = 1
  ) {
    this.llmEndpoint = llmEndpoint;
    this.model = model;
    this.relevanceThreshold = relevanceThreshold;
    this.groundednessThreshold = groundednessThreshold;
  }

  async checkContextRelevance(query: string, documents: Document[]): Promise<ReflectionResult> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      // Assume relevant if we can't check
      return { isRelevant: true, isGrounded: true, score: 2 };
    }

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = RELEVANCE_CHECK_PROMPT
      .replace('{query}', query)
      .replace('{context}', contextText.slice(0, 4000));

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a relevance evaluator. Always respond with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          max_tokens: 256,
        }),
      });

      if (!response.ok) {
        return { isRelevant: true, isGrounded: true, score: 2 };
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isRelevant: parsed.score >= this.relevanceThreshold,
          isGrounded: true,
          score: parsed.score,
          feedback: parsed.reasoning,
        };
      }
    } catch (error) {
      console.error('Relevance check failed:', error);
    }

    return { isRelevant: true, isGrounded: true, score: 2 };
  }

  async checkResponseGroundedness(response: string, documents: Document[]): Promise<ReflectionResult> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return { isRelevant: true, isGrounded: true, score: 2 };
    }

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = GROUNDEDNESS_CHECK_PROMPT
      .replace('{context}', contextText.slice(0, 4000))
      .replace('{response}', response);

    try {
      const fetchResponse = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a groundedness evaluator. Always respond with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          max_tokens: 512,
        }),
      });

      if (!fetchResponse.ok) {
        return { isRelevant: true, isGrounded: true, score: 2 };
      }

      const data = await fetchResponse.json();
      const content = data.choices[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isRelevant: true,
          isGrounded: parsed.score >= this.groundednessThreshold,
          score: parsed.score,
          feedback: parsed.reasoning,
        };
      }
    } catch (error) {
      console.error('Groundedness check failed:', error);
    }

    return { isRelevant: true, isGrounded: true, score: 2 };
  }

  async rewriteQueryForRelevance(query: string, documents: Document[]): Promise<string> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return query;

    const contextText = documents.map(d => d.content).join('\n\n').slice(0, 2000);
    const prompt = QUERY_REWRITE_FOR_RELEVANCE_PROMPT
      .replace('{query}', query)
      .replace('{context}', contextText);

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 256,
        }),
      });

      if (!response.ok) return query;

      const data = await response.json();
      const rewritten = data.choices[0]?.message?.content?.trim();
      return rewritten || query;
    } catch {
      return query;
    }
  }

  async regenerateResponse(
    query: string,
    documents: Document[],
    previousResponse: string
  ): Promise<string | null> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return null;

    const contextText = documents.map(d => d.content).join('\n\n---\n\n');
    const prompt = `The following response was not well-grounded in the context. Generate a new response that is strictly based on the provided context.

Query: ${query}

Context:
${contextText.slice(0, 4000)}

Previous Response (not well-grounded):
${previousResponse}

Generate a new response that:
1. Only makes claims supported by the context
2. Cites specific information from the context
3. Acknowledges when information is not available

If the context doesn't contain enough information to answer the query, say "OUT OF CONTEXT" and explain what information is missing.

New Response:`;

    try {
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}

/**
 * Reflection Counter
 * Tracks reflection iterations to prevent infinite loops
 */
export class ReflectionCounter {
  private maxLoops: number;
  private currentCount: number = 0;

  constructor(maxLoops: number = 3) {
    this.maxLoops = maxLoops;
  }

  increment(): boolean {
    if (this.currentCount >= this.maxLoops) {
      return false;
    }
    this.currentCount++;
    return true;
  }

  get remaining(): number {
    return Math.max(0, this.maxLoops - this.currentCount);
  }

  reset(): void {
    this.currentCount = 0;
  }
}
