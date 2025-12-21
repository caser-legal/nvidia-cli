/**
 * Research Workflow
 * Based on NVIDIA AIQ Research Assistant Blueprint
 * Implements: Generate Queries → Research → Summarize → Reflect → Finalize
 */

import { Document, WorkflowState, SubQuery } from './types';
import { QueryDecomposer } from './query-decomposition';
import { ReflectionSystem, ReflectionCounter } from './reflection';
import { NVIDIAReranker } from './embeddings';

export interface ResearchConfig {
  maxReflections: number;
  searchWeb: boolean;
  tavilyApiKey?: string;
  numQueries: number;
}

export interface ResearchResult {
  report: string;
  citations: string[];
  queries: SubQuery[];
  iterations: number;
}

const REPORT_ORGANIZATION = `
## Executive Summary
Brief overview of key findings

## Background
Context and relevant information

## Analysis
Detailed analysis of the topic

## Conclusions
Key takeaways and recommendations
`;

const SUMMARIZE_PROMPT = `You are a research report writer. Based on the research findings, write or extend a report section.

Report Organization:
${REPORT_ORGANIZATION}

Existing Report (if any):
{existing_report}

New Research Findings:
{new_findings}

Instructions:
1. If there's an existing report, extend it with the new findings
2. If starting fresh, create a new report following the organization
3. Cite sources using [Source: URL] format
4. Be comprehensive but concise
5. Focus on factual information from the research

Updated Report:`;

const REFLECTION_PROMPT = `You are reviewing a research report to identify knowledge gaps.

Report Organization:
${REPORT_ORGANIZATION}

Topic: {topic}

Current Report:
{report}

Identify ONE specific knowledge gap that would improve this report. Generate a follow-up search query to address this gap.

Respond with JSON:
{
  "hasGap": true/false,
  "gap": "description of the knowledge gap",
  "query": "search query to fill the gap"
}`;

export class ResearchWorkflow {
  private decomposer: QueryDecomposer;
  private reflection: ReflectionSystem;
  private reranker: NVIDIAReranker;
  private config: ResearchConfig;
  private llmEndpoint: string;
  private model: string;

  constructor(
    config: ResearchConfig = {
      maxReflections: 2,
      searchWeb: true,
      numQueries: 5,
    },
    llmEndpoint: string = 'https://integrate.api.nvidia.com/v1',
    model: string = 'nvidia/llama-3.1-nemotron-70b-instruct'
  ) {
    this.config = config;
    this.llmEndpoint = llmEndpoint;
    this.model = model;
    this.decomposer = new QueryDecomposer(llmEndpoint, model);
    this.reflection = new ReflectionSystem(llmEndpoint, model);
    this.reranker = new NVIDIAReranker();
  }

  async run(topic: string, searchFn: (query: string) => Promise<Document[]>): Promise<ResearchResult> {
    const reflectionCounter = new ReflectionCounter(this.config.maxReflections);
    let report = '';
    const allCitations: Set<string> = new Set();
    const allQueries: SubQuery[] = [];
    let iterations = 0;

    // Step 1: Generate initial queries
    const decomposed = await this.decomposer.decompose(topic);
    allQueries.push(...decomposed.subQueries);

    // Step 2: Research each query
    const researchFindings = await this.processQueries(decomposed.subQueries, searchFn, allCitations);

    // Step 3: Generate initial report
    report = await this.summarize('', researchFindings);
    iterations++;

    // Step 4: Reflection loop
    while (reflectionCounter.increment()) {
      const reflectionResult = await this.reflect(topic, report);
      
      if (!reflectionResult.hasGap) {
        break;
      }

      // Generate follow-up query
      const followUpQuery: SubQuery = {
        query: reflectionResult.query,
        rationale: reflectionResult.gap,
      };
      allQueries.push(followUpQuery);

      // Research the follow-up
      const newFindings = await this.processQueries([followUpQuery], searchFn, allCitations);

      // Extend report
      report = await this.summarize(report, newFindings);
      iterations++;
    }

    // Step 5: Finalize report
    const finalReport = await this.finalize(report, Array.from(allCitations));

    return {
      report: finalReport,
      citations: Array.from(allCitations),
      queries: allQueries,
      iterations,
    };
  }

  private async processQueries(
    queries: SubQuery[],
    searchFn: (query: string) => Promise<Document[]>,
    citations: Set<string>
  ): Promise<string> {
    const findings: string[] = [];

    // Process queries in parallel
    const results = await Promise.all(
      queries.map(async (q) => {
        const docs = await searchFn(q.query);
        return { query: q, docs };
      })
    );

    for (const { query, docs } of results) {
      if (docs.length === 0) continue;

      // Rerank documents
      let rankedDocs = docs;
      try {
        const reranked = await this.reranker.rerank(
          query.query,
          docs.map(d => ({ content: d.content, metadata: d.metadata }))
        );
        rankedDocs = reranked.map(r => ({
          id: docs[r.index].id,
          content: r.content,
          metadata: { ...docs[r.index].metadata, relevanceScore: r.score },
        }));
      } catch {
        // Use original order if reranking fails
      }

      // Collect citations
      for (const doc of rankedDocs) {
        if (doc.metadata.source) {
          citations.add(doc.metadata.source as string);
        }
      }

      // Format findings
      const docSummary = rankedDocs
        .slice(0, 3)
        .map(d => `[Source: ${d.metadata.source || 'Unknown'}]\n${d.content}`)
        .join('\n\n');

      findings.push(`### Query: ${query.query}\n\n${docSummary}`);
    }

    return findings.join('\n\n---\n\n');
  }

  private async summarize(existingReport: string, newFindings: string): Promise<string> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return existingReport + '\n\n' + newFindings;
    }

    const prompt = SUMMARIZE_PROMPT
      .replace('{existing_report}', existingReport || 'None - starting fresh')
      .replace('{new_findings}', newFindings);

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
          temperature: 0.5,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        return existingReport + '\n\n' + newFindings;
      }

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || existingReport;
    } catch {
      return existingReport + '\n\n' + newFindings;
    }
  }

  private async reflect(topic: string, report: string): Promise<{ hasGap: boolean; gap: string; query: string }> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return { hasGap: false, gap: '', query: '' };
    }

    const prompt = REFLECTION_PROMPT
      .replace('{topic}', topic)
      .replace('{report}', report);

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
            { role: 'system', content: 'You are a research reviewer. Always respond with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 512,
        }),
      });

      if (!response.ok) {
        return { hasGap: false, gap: '', query: '' };
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Ignore errors
    }

    return { hasGap: false, gap: '', query: '' };
  }

  private async finalize(report: string, citations: string[]): Promise<string> {
    // Format citations
    const citationSection = citations.length > 0
      ? `\n\n## Sources\n\n${citations.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

    // Clean up any thinking tags
    let cleanReport = report;
    while (cleanReport.includes('<think>') && cleanReport.includes('</think>')) {
      const start = cleanReport.indexOf('<think>');
      const end = cleanReport.indexOf('</think>') + '</think>'.length;
      cleanReport = cleanReport.slice(0, start) + cleanReport.slice(end);
    }

    return cleanReport + citationSection;
  }
}
