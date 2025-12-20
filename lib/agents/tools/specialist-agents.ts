// Specialist Agent Tools
// Sub-agents that the Coordinator can call for multi-agent workflows

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";
import { GoogleSearchTool } from "./google-search";

// Shared config for all specialist agents
const SPECIALIST_CONFIG = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384, // Smaller for sub-agents
  temperature: 1.0,
  topP: 1.0,
  contextWindowTokens: 128000,
};

// ============================================
// 1. SEARCH SPECIALIST - Expert at finding information
// ============================================
const SEARCH_SPECIALIST_PROMPT = `You are a Search Specialist Agent.

Your ONLY job is to search the web and gather relevant information.

When given a research topic:
1. Formulate effective search queries
2. Search for multiple aspects of the topic
3. Compile the key findings
4. Return a structured summary of what you found

Always include the sources of your information.
Be thorough but focused - gather facts, not opinions.

Format your response as:
## Search Results Summary
[Your findings organized by subtopic]

## Sources
[List of URLs and titles]`;

export class SearchSpecialistTool extends BaseTool {
  name = "search_specialist";
  description = `Call the Search Specialist to gather information from the web.
Use this when you need to find current information, facts, or data about a topic.
The search specialist will search the web and return a structured summary of findings.`;

  parameters = {
    research_topic: {
      type: "string",
      description: "The topic or question to research",
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const topic = args.research_topic as string;
    
    const searchAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: SEARCH_SPECIALIST_PROMPT,
      tools: [new GoogleSearchTool()],
      config: SPECIALIST_CONFIG,
    });

    const result = await searchAgent.run(`Research this topic thoroughly: ${topic}`);
    return result;
  }
}

// ============================================
// 2. REPORT WRITER - Expert at writing reports
// ============================================
const REPORT_WRITER_PROMPT = `You are a Report Writer Specialist Agent.

Your ONLY job is to transform raw research into well-written reports.

When given research findings:
1. Organize information logically
2. Write clear, engaging prose
3. Include relevant sections (Overview, Key Points, Details, Conclusion)
4. Use markdown formatting for structure
5. Cite sources where appropriate

Do NOT search for new information - work only with what you're given.

Format your report as:
# [Report Title]

## Overview
[Brief summary]

## Key Findings
[Main points as bullet list]

## Detailed Analysis
[In-depth discussion]

## Conclusion
[Summary and implications]

## Sources
[Citations from the research]`;

export class ReportWriterTool extends BaseTool {
  name = "report_writer";
  description = `Call the Report Writer to create a well-structured report from research findings.
Use this after gathering information to transform raw data into a polished report.
The report writer will organize and format the information professionally.`;

  parameters = {
    research_findings: {
      type: "string",
      description: "The raw research findings to transform into a report",
    },
    report_title: {
      type: "string",
      description: "The title for the report",
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const findings = args.research_findings as string;
    const title = args.report_title as string;
    
    const writerAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REPORT_WRITER_PROMPT,
      tools: [], // No tools - pure writing capability
      config: SPECIALIST_CONFIG,
    });

    const result = await writerAgent.run(
      `Create a report titled "${title}" from these research findings:\n\n${findings}`
    );
    return result;
  }
}

// ============================================
// 3. QUALITY REVIEWER - Expert at evaluation
// ============================================
const QUALITY_REVIEWER_PROMPT = `You are a Quality Reviewer Specialist Agent.

Your ONLY job is to evaluate if a report is helpful and complete.

When reviewing a report:
1. Check if it answers the original question
2. Verify key information is included
3. Assess clarity and readability
4. Identify any gaps or missing information
5. Provide a helpfulness score (1-10) with justification

Be constructive - if improvements are needed, explain what's missing.
If the report is good, confirm it's ready for the user.

Format your review as:
## Quality Review

**Helpfulness Score: X/10**

### Strengths
[What the report does well]

### Areas for Improvement
[What could be better - be specific]

### Verdict
[APPROVED - ready for user] or [NEEDS REVISION - specific changes needed]`;

export class QualityReviewerTool extends BaseTool {
  name = "quality_reviewer";
  description = `Call the Quality Reviewer to evaluate if a report is helpful and complete.
Use this after creating a report to verify quality before presenting to the user.
The reviewer will score the report and suggest improvements if needed.`;

  parameters = {
    original_question: {
      type: "string",
      description: "The original user question/request",
    },
    report: {
      type: "string",
      description: "The report to review",
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const question = args.original_question as string;
    const report = args.report as string;
    
    const reviewerAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: QUALITY_REVIEWER_PROMPT,
      tools: [], // No tools - pure evaluation capability
      config: SPECIALIST_CONFIG,
    });

    const result = await reviewerAgent.run(
      `Review this report for the question: "${question}"\n\nReport:\n${report}`
    );
    return result;
  }
}
