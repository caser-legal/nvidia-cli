/**
 * Query Decomposition
 * Based on NVIDIA RAG Blueprint query_decomposition.py
 */

import { DecomposedQuery } from './types';
import { createLogger } from '../../logger';
import { NVIDIA_API_KEY } from '../../api-key';

const log = createLogger("QueryDecomposer");

const DECOMPOSITION_PROMPT = `You are an expert at breaking down complex questions into simpler sub-questions.

Given a complex question, decompose it into 2-5 simpler, focused sub-questions that together would help answer the original question.

For each sub-question, provide:
1. The sub-question itself
2. A brief rationale for why this sub-question is needed

If the question is already simple and doesn't need decomposition, return it as-is with a single sub-question.

Original Question: {question}

Respond in JSON format:
{
  "needsDecomposition": true/false,
  "subQueries": [
    {"query": "sub-question 1", "rationale": "why this helps"},
    {"query": "sub-question 2", "rationale": "why this helps"}
  ]
}`;

export class QueryDecomposer {
  private llmEndpoint: string;
  private model: string;

  constructor(llmEndpoint: string = 'https://integrate.api.nvidia.com/v1', model: string = 'nvidia/nemotron-3-nano-30b-a3b') {
    this.llmEndpoint = llmEndpoint;
    this.model = model;
  }

  async decompose(query: string): Promise<DecomposedQuery> {
    const apiKey = NVIDIA_API_KEY;
    if (!apiKey) {
      return { originalQuery: query, subQueries: [{ query, rationale: 'Original query' }], needsDecomposition: false };
    }

    try {
      const prompt = DECOMPOSITION_PROMPT.replace('{question}', query);
      
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: 'You are a helpful assistant that decomposes complex queries. Always respond with valid JSON.' }, { role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        log.warn(`LLM API returned ${response.status}, using fallback`);
        return { originalQuery: query, subQueries: [{ query, rationale: 'Original query (decomposition unavailable)' }], needsDecomposition: false };
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { originalQuery: query, subQueries: parsed.subQueries || [{ query, rationale: 'Original query' }], needsDecomposition: parsed.needsDecomposition ?? false };
      }
    } catch (error) {
      log.error('Query decomposition failed', { error: String(error) });
    }

    return { originalQuery: query, subQueries: [{ query, rationale: 'Original query' }], needsDecomposition: false };
  }

  async rewriteWithContext(query: string, history: { question: string; answer: string }[]): Promise<string> {
    if (history.length === 0) return query;

    const apiKey = NVIDIA_API_KEY;
    if (!apiKey) return query;

    try {
      const historyStr = history.map(h => `Q: ${h.question}\nA: ${h.answer}`).join('\n\n');
      const prompt = `Given a query and conversation history, rewrite the query to be more specific and self-contained.\n\nConversation History:\n${historyStr}\n\nOriginal Query: ${query}\n\nRewritten Query:`;

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

  async generateFollowUp(originalQuery: string, history: { question: string; answer: string }[], context: string): Promise<string | null> {
    const apiKey = NVIDIA_API_KEY;
    if (!apiKey) return null;

    try {
      const historyStr = history.map(h => `Q: ${h.question}\nA: ${h.answer}`).join('\n\n');
      const prompt = `Based on the conversation history and context, determine if a follow-up question is needed.\n\nOriginal Query: ${originalQuery}\n\nConversation History:\n${historyStr}\n\nContext:\n${context.slice(0, 2000)}\n\nIf a follow-up question would help, provide it. Otherwise respond with "NO_FOLLOWUP".\n\nFollow-up Question:`;

      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 256 }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const followUp = data.choices[0]?.message?.content?.trim();
      if (followUp && !followUp.includes('NO_FOLLOWUP')) return followUp;
    } catch {
      // Ignore errors
    }

    return null;
  }
}
