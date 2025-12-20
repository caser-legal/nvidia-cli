// Specialist Agent Tools
// Sub-agents that the Coordinator can call for multi-agent workflows
// Enhanced with parallel search, reflection loop, and source deduplication

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";
import { GoogleSearchTool } from "./google-search";
import { ParallelSearchTool, deduplicateCitations } from "./parallel-search";
import { LocalDocsSearchTool } from "./local-docs-search";

// Shared config for all specialist agents
const SPECIALIST_CONFIG = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 1.0,
  topP: 1.0,
  contextWindowTokens: 128000,
};

// ============================================
// 1. SEARCH SPECIALIST - Expert at finding information
// Now uses parallel search and local docs
// ============================================
const SEARCH_SPECIALIST_PROMPT = `You are a Search Specialist Agent with advanced research capabilities.

Your job is to gather comprehensive information using multiple search strategies:

1. FIRST: Check local documentation (local_docs_search) for existing knowledge
2. THEN: Use parallel_search to search multiple queries simultaneously
3. FINALLY: Use google_search for specific follow-up queries

SEARCH STRATEGY:
- Generate 3-5 different search queries for the topic (different angles)
- Use parallel_search to run them all at once
- Review results and identify gaps
- Do targeted follow-up searches if needed

ALWAYS:
- Include source URLs for every piece of information
- Note which sources are from local docs vs web
- Deduplicate information from multiple sources
- Prioritize recent and authoritative sources

Format your response as:
## Research Summary
[Key findings organized by subtopic]

## Sources
[Numbered list of all sources with URLs]

## Search Queries Used
[List of queries that produced results]`;

export class SearchSpecialistTool extends BaseTool {
  name = "search_specialist";
  description = `Call the Search Specialist to gather comprehensive information.
Uses parallel search (multiple queries at once) and checks local docs first.
Returns deduplicated findings with sources.`;

  parameters = {
    research_topic: {
      type: "string",
      description: "The topic or question to research",
    },
    search_depth: {
      type: "string",
      description: "How deep to search: 'quick' (3 queries), 'standard' (5 queries), 'deep' (8+ queries)",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const topic = args.research_topic as string;
    const depth = (args.search_depth as string) || "standard";
    
    const searchAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: SEARCH_SPECIALIST_PROMPT,
      tools: [
        new LocalDocsSearchTool(),
        new ParallelSearchTool(),
        new GoogleSearchTool(),
      ],
      config: SPECIALIST_CONFIG,
    });

    const depthInstruction = {
      quick: "Do a quick search with 3 parallel queries.",
      standard: "Do a thorough search with 5 parallel queries covering different angles.",
      deep: "Do an exhaustive search with 8+ parallel queries, follow up on any gaps.",
    }[depth] || "Do a thorough search with 5 parallel queries.";

    const result = await searchAgent.run(
      `Research this topic comprehensively: ${topic}\n\n${depthInstruction}\n\nFirst check local docs, then use parallel search for web sources.`
    );
    return result;
  }
}

// ============================================
// 2. REPORT WRITER - Expert at writing reports
// ============================================
const REPORT_WRITER_PROMPT = `You are a Report Writer Specialist Agent.

Your ONLY job is to transform raw research into well-written reports.

When given research findings:
1. Organize information logically by theme/topic
2. Write clear, engaging prose with proper flow
3. Include relevant sections based on content (not forced structure)
4. Use markdown formatting for readability
5. ALWAYS cite sources inline using [1], [2], etc.
6. Include a Sources section at the end

CITATION RULES:
- Every factual claim must have a citation
- Use inline citations like: "The market grew 15% [1]"
- Deduplicate sources - same URL = same citation number
- List all sources at the end with full URLs

Do NOT search for new information - work only with what you're given.

Format your report as:
# [Report Title]

## Executive Summary
[2-3 sentence overview]

## [Topic Sections as needed]
[Content with inline citations]

## Conclusion
[Key takeaways]

## Sources
[1] Title - URL
[2] Title - URL
...`;

export class ReportWriterTool extends BaseTool {
  name = "report_writer";
  description = `Call the Report Writer to create a well-structured report from research findings.
Automatically deduplicates sources and adds proper citations.
Use this after gathering information to transform raw data into a polished report.`;

  parameters = {
    research_findings: {
      type: "string",
      description: "The raw research findings to transform into a report",
    },
    report_title: {
      type: "string",
      description: "The title for the report",
    },
    report_style: {
      type: "string",
      description: "Style: 'brief' (1-2 pages), 'standard' (3-5 pages), 'comprehensive' (detailed)",
      optional: true,
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
    const style = (args.report_style as string) || "standard";
    
    const writerAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REPORT_WRITER_PROMPT,
      tools: [], // No tools - pure writing capability
      config: SPECIALIST_CONFIG,
    });

    const styleInstruction = {
      brief: "Keep it concise - 1-2 pages max. Focus on key points only.",
      standard: "Write a balanced report - 3-5 pages with good detail.",
      comprehensive: "Write a detailed, comprehensive report covering all aspects.",
    }[style] || "Write a balanced report.";

    const result = await writerAgent.run(
      `Create a report titled "${title}" from these research findings:\n\n${findings}\n\n${styleInstruction}\n\nEnsure all sources are properly cited and deduplicated.`
    );
    return result;
  }
}

// ============================================
// 3. QUALITY REVIEWER - Expert at evaluation
// ============================================
const QUALITY_REVIEWER_PROMPT = `You are a Quality Reviewer Specialist Agent.

Your ONLY job is to evaluate if a report is helpful, complete, and accurate.

EVALUATION CRITERIA:
1. **Completeness** (0-10): Does it fully answer the original question?
2. **Accuracy** (0-10): Are claims supported by cited sources?
3. **Clarity** (0-10): Is it well-organized and easy to understand?
4. **Citations** (0-10): Are sources properly cited and credible?
5. **Depth** (0-10): Is there sufficient detail and analysis?

REVIEW PROCESS:
1. Read the original question carefully
2. Check if each aspect is addressed
3. Verify citations are present for claims
4. Identify specific gaps or weaknesses
5. Calculate overall helpfulness score

Format your review as:
## Quality Review

### Scores
- Completeness: X/10
- Accuracy: X/10  
- Clarity: X/10
- Citations: X/10
- Depth: X/10
- **Overall: X/10**

### Strengths
[What the report does well - be specific]

### Gaps Identified
[What's missing or weak - be specific about what needs to be added]

### Follow-up Queries
[If gaps exist, list specific search queries to fill them]

### Verdict
**[APPROVED]** - Ready for delivery
OR
**[NEEDS_REVISION]** - Specific changes needed: [list them]
OR  
**[NEEDS_MORE_RESEARCH]** - Additional research needed on: [topics]`;

export class QualityReviewerTool extends BaseTool {
  name = "quality_reviewer";
  description = `Call the Quality Reviewer to evaluate if a report is helpful and complete.
Returns scores, identified gaps, and follow-up queries if more research is needed.
Verdict will be APPROVED, NEEDS_REVISION, or NEEDS_MORE_RESEARCH.`;

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
      `Review this report for the question: "${question}"\n\nReport:\n${report}\n\nProvide detailed scores, identify any gaps, and give your verdict.`
    );
    return result;
  }
}

// ============================================
// 4. REPORT EXTENDER - Integrates new findings
// ============================================
const REPORT_EXTENDER_PROMPT = `You are a Report Extension Specialist.

Your job is to EXTEND an existing report with new information, NOT rewrite it.

EXTENSION RULES:
1. Keep all existing content intact
2. Add new information in appropriate sections
3. Update conclusions if new evidence changes them
4. Add new sources to the citation list (continue numbering)
5. Maintain consistent tone and formatting
6. Mark where new content was added with subtle integration

DO NOT:
- Rewrite sections that don't need updating
- Remove existing content
- Change the overall structure
- Add "UPDATE:" or obvious markers

Output the complete updated report with new information seamlessly integrated.`;

export class ReportExtenderTool extends BaseTool {
  name = "report_extender";
  description = `Extend an existing report with new research findings.
Use this after quality review identifies gaps and new searches fill them.
Seamlessly integrates new information without rewriting the whole report.`;

  parameters = {
    existing_report: {
      type: "string",
      description: "The current report to extend",
    },
    new_findings: {
      type: "string",
      description: "New research findings to integrate",
    },
    gaps_to_fill: {
      type: "string",
      description: "Which gaps from the review are being addressed",
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const existingReport = args.existing_report as string;
    const newFindings = args.new_findings as string;
    const gaps = args.gaps_to_fill as string;
    
    const extenderAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REPORT_EXTENDER_PROMPT,
      tools: [],
      config: {
        ...SPECIALIST_CONFIG,
        maxTokens: 24000, // Larger for full report output
      },
    });

    const result = await extenderAgent.run(
      `Extend this report with new findings.\n\nGaps being addressed:\n${gaps}\n\nExisting Report:\n${existingReport}\n\nNew Findings to Integrate:\n${newFindings}`
    );
    return result;
  }
}

// ============================================
// 5. SOURCE DEDUPLICATOR - Cleans up citations
// ============================================
export class SourceDeduplicatorTool extends BaseTool {
  name = "deduplicate_sources";
  description = `Clean up and deduplicate a list of sources/citations.
Use this to consolidate sources from multiple searches before writing a report.
Removes duplicates, standardizes format, and numbers sources.`;

  parameters = {
    sources: {
      type: "string",
      description: "Raw list of sources/citations to deduplicate",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const sourcesRaw = args.sources as string;
    
    // Split into individual citations
    const lines = sourcesRaw.split("\n").filter(l => l.trim());
    
    // Deduplicate
    const unique = deduplicateCitations(lines);
    
    // Renumber
    const numbered = unique.map((s, i) => {
      // Remove existing numbers
      const cleaned = s.replace(/^\[\d+\]\s*/, "").replace(/^\d+\.\s*/, "");
      return `[${i + 1}] ${cleaned}`;
    });
    
    return `## Deduplicated Sources (${numbered.length} unique)\n\n${numbered.join("\n")}`;
  }
}
