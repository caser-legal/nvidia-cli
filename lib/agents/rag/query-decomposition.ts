/**
 * Query Decomposition
 * Based on NVIDIA RAG Blueprint query_decomposition.py
 * Breaks complex queries into simpler sub-queries for better retrieval
 */

import { SubQuery, DecomposedQuery } from './types';

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

const QUERY_REWRITE_PROMPT = `You are an expert at rewriting queries for better search results.

Given a query and conversation history, rewrite the query to be more specific and self-contained.
The rewritten query should:
1. Include relevant context from the conversation
2. Be specific enough to retrieve relevant documents
3. Be self-contained (understandable without the conversation history)

Conversation History:
{history}

Original Query: {query}

Rewritten Query:`;

export class QueryDecomposer {
  private llmEndpoint: string;
  private model: string;

  constructor(llmEndpoint: string = 'https://integrate.api.nvidia.com/v1', model: string = 'nvidia/nemotron-3-nano-30b-a3b') {
    this.llmEndpoint = llmEndpoint;
    this.model = model;
  }

  async decompose(query: string): Promise<DecomposedQuery> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      // Fallback: return original query without decomposition
      return {
        originalQuery: query,
        subQueries: [{ query, rationale: 'Original query' }],
        needsDecomposition: false,
      };
    }

    try {
      const prompt = DECOMPOSITION_PROMPT.replace('{question}', query);
      
      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant that decomposes complex queries. Always respond with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          originalQuery: query,
          subQueries: parsed.subQueries || [{ query, rationale: 'Original query' }],
          needsDecomposition: parsed.needsDecomposition ?? false,
        };
      }
    } catch (error) {
      console.error('Query decomposition failed:', error);
    }

    // Fallback
    return {
      originalQuery: query,
      subQueries: [{ query, rationale: 'Original query' }],
      needsDecomposition: false,
    };
  }

  async rewriteWithContext(query: string, history: { question: string; answer: string }[]): Promise<string> {
    if (history.length === 0) {
      return query;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return query;
    }

    try {
      const historyStr = history
        .map(h => `Q: ${h.question}\nA: ${h.answer}`)
        .join('\n\n');

      const prompt = QUERY_REWRITE_PROMPT
        .replace('{history}', historyStr)
        .replace('{query}', query);

      const response = await fetch(`${this.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 256,
        }),
      });

      if (!response.ok) {
        return query;
      }

      const data = await response.json();
      const rewritten = data.choices[0]?.message?.content?.trim();
      return rewritten || query;
    } catch {
      return query;
    }
  }

  async generateFollowUp(
    originalQuery: string,
    history: { question: string; answer: string }[],
    context: string
  ): Promise<string | null> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return null;

    try {
      const historyStr = history
        .map(h => `Q: ${h.question}\nA: ${h.answer}`)
        .join('\n\n');

      const prompt = `Based on the conversation history and context, determine if a follow-up question is needed to fully answer the original query.

Original Query: ${originalQuery}

Conversation History:
${historyStr}

Context:
${context.slice(0, 2000)}

If a follow-up question would help gather more information, provide it. If the original query has been sufficiently addressed, respond with "NO_FOLLOWUP".

Follow-up Question:`;

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

      if (!response.ok) return null;

      const data = await response.json();
      const followUp = data.choices[0]?.message?.content?.trim();
      
      if (followUp && !followUp.includes('NO_FOLLOWUP')) {
        return followUp;
      }
    } catch {
      // Ignore errors
    }

    return null;
  }
}
