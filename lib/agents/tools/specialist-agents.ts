// Specialist Agent Tools
// Sub-agents that the Coordinator can call for multi-agent workflows
// Enhanced with Tavily search, report planning, and parallel section writing

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";
import { GoogleSearchTool } from "./google-search";
import { ParallelSearchTool, deduplicateCitations } from "./parallel-search";
import { LocalDocsSearchTool } from "./local-docs-search";
import { TavilySearchTool, ParallelTavilySearchTool } from "./tavily-search";

// Specialist agents use Super-49B for best instruction following (ArenaHard 92%, IFEval 88.6%)
const SPECIALIST_CONFIG = {
  model: "nvidia/nemotron-3-nano-30b-a3b",
  maxTokens: 16384,
  temperature: 1.0,
  topP: 1.0,
  contextWindowTokens: 128000,
};

// ============================================
// 1. SEARCH SPECIALIST - Expert at finding information
// Now uses Tavily (primary), Google (fallback), and local docs
// ============================================
const SEARCH_SPECIALIST_PROMPT = `You are a Search Specialist Agent with advanced research capabilities.

Your job is to gather comprehensive information using multiple search strategies:

1. FIRST: Check local documentation (local_docs_search) for existing knowledge
2. THEN: Use parallel_tavily_search for deep web research (best for AI agents)
3. FALLBACK: Use parallel_search (Google) if Tavily quota is exhausted

SEARCH STRATEGY:
- Generate 3-5 different search queries for the topic (different angles)
- Use parallel_tavily_search to run them all at once (better content extraction)
- Review results and identify gaps
- Do targeted follow-up searches if needed

TAVILY TOPICS:
- "general" - Default, broad search
- "news" - Recent news and developments
- "finance" - Financial data and reports

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
Uses Tavily (AI-optimized) for deep research, checks local docs first.
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
    topic_type: {
      type: "string",
      description: "Type of content: 'general', 'news', or 'finance'",
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
    const topicType = (args.topic_type as string) || "general";
    
    const searchAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: SEARCH_SPECIALIST_PROMPT,
      tools: [
        new LocalDocsSearchTool(),
        new ParallelTavilySearchTool(),
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
      `Research this topic comprehensively: ${topic}

${depthInstruction}

Use topic type "${topicType}" for Tavily searches.
First check local docs, then use parallel_tavily_search for web sources.`
    );
    return result;
  }
}

// ============================================
// 2. REPORT PLANNER - Creates outline before writing
// ============================================
const REPORT_PLANNER_PROMPT = `You are a Report Planner Specialist.

Your job is to create a structured outline for a research report BEFORE any writing begins.

Given a topic and initial research findings, you must:
1. Identify the key themes and subtopics
2. Create a logical section structure
3. Determine which sections need additional research
4. Estimate the depth needed for each section

PLANNING PRINCIPLES:
- Start with an Introduction that sets context
- Group related topics into coherent sections (3-7 sections typical)
- End with Conclusion that synthesizes findings
- Mark sections needing more research with specific queries

Format your plan as:
## Report Plan: [Title]

### Sections:
1. **[Section Name]** - [Description]
   - Research needed: Yes/No
   - Queries: [if yes, list specific search queries]

2. **[Section Name]** - [Description]
   ...

### Estimated Length: [brief/standard/comprehensive]`;

export class ReportPlannerTool extends BaseTool {
  name = "report_planner";
  description = `Create a structured outline for a research report before writing.
Use this after initial research to plan the report structure.
Identifies which sections need additional research.`;

  parameters = {
    topic: {
      type: "string",
      description: "The main topic of the report",
    },
    initial_research: {
      type: "string",
      description: "Initial research findings to base the plan on",
    },
    report_style: {
      type: "string",
      description: "Desired style: 'brief', 'standard', or 'comprehensive'",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const topic = args.topic as string;
    const research = args.initial_research as string;
    const style = (args.report_style as string) || "standard";

    const plannerAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REPORT_PLANNER_PROMPT,
      tools: [],
      config: SPECIALIST_CONFIG,
    });

    const result = await plannerAgent.run(
      `Create a ${style} report plan for: "${topic}"

Based on this initial research:
${research}

Create a clear outline with sections and identify any gaps needing more research.`
    );
    return result;
  }
}

// ============================================
// 3. SECTION AUTHOR - Writes individual sections
// Can be called in parallel for multiple sections
// ============================================
const SECTION_AUTHOR_PROMPT = `You are a Section Author Specialist.

Your job is to write ONE section of a report based on:
1. The section name and description
2. Available research findings
3. The overall report context

WRITING GUIDELINES:
- Write in clear, professional prose
- Use markdown formatting (headers, lists, bold)
- Include inline citations [1], [2], etc.
- Stay focused on the section topic
- Provide sufficient depth without padding
- Connect to the broader report narrative

If research is insufficient, note what information is missing.

Output the section content in markdown format.`;

export class SectionAuthorTool extends BaseTool {
  name = "section_author";
  description = `Write a single section of a report.
Use this to write individual sections based on the report plan.
Can be called in parallel for multiple sections.`;

  parameters = {
    section_name: {
      type: "string",
      description: "Name of the section to write",
    },
    section_description: {
      type: "string",
      description: "Description of what the section should cover",
    },
    research_findings: {
      type: "string",
      description: "Research findings relevant to this section",
    },
    report_context: {
      type: "string",
      description: "Brief context about the overall report topic",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const sectionName = args.section_name as string;
    const description = args.section_description as string;
    const research = args.research_findings as string;
    const context = (args.report_context as string) || "";

    const authorAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: SECTION_AUTHOR_PROMPT,
      tools: [],
      config: {
        ...SPECIALIST_CONFIG,
        maxTokens: 8192,
      },
    });

    const result = await authorAgent.run(
      `Write the "${sectionName}" section.

**Description:** ${description}
**Report Context:** ${context || "General research report"}

**Research:**
${research}

Write the section with proper citations.`
    );
    return `## ${sectionName}\n\n${result}`;
  }
}

// ============================================
// 4. REPORT WRITER - Creates full reports (legacy, still useful)
// ============================================
const REPORT_WRITER_PROMPT = `You are a Report Writer Specialist Agent.

Your ONLY job is to transform raw research into well-written reports.

When given research findings:
1. Organize information logically by theme/topic
2. Write clear, engaging prose with proper flow
3. Include relevant sections based on content
4. Use markdown formatting for readability
5. ALWAYS cite sources inline using [1], [2], etc.
6. Include a Sources section at the end

CITATION RULES:
- Every factual claim must have a citation
- Use inline citations like: "The market grew 15% [1]"
- Deduplicate sources - same URL = same citation number
- List all sources at the end with full URLs

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
...`;

export class ReportWriterTool extends BaseTool {
  name = "report_writer";
  description = `Call the Report Writer to create a well-structured report from research findings.
Automatically deduplicates sources and adds proper citations.
Use for quick reports or when not using the planner workflow.`;

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
      description: "Style: 'brief', 'standard', 'comprehensive'",
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
      tools: [],
      config: SPECIALIST_CONFIG,
    });

    const styleInstruction = {
      brief: "Keep it concise - 1-2 pages max.",
      standard: "Write a balanced report - 3-5 pages.",
      comprehensive: "Write a detailed, comprehensive report.",
    }[style] || "Write a balanced report.";

    const result = await writerAgent.run(
      `Create a report titled "${title}" from these findings:\n\n${findings}\n\n${styleInstruction}`
    );
    return result;
  }
}

// ============================================
// 5. QUALITY REVIEWER - Evaluates reports
// ============================================
const QUALITY_REVIEWER_PROMPT = `You are a Quality Reviewer Specialist Agent.

EVALUATION CRITERIA (score each 0-10):
1. **Completeness**: Does it fully answer the original question?
2. **Accuracy**: Are claims supported by cited sources?
3. **Clarity**: Is it well-organized and easy to understand?
4. **Citations**: Are sources properly cited and credible?
5. **Depth**: Is there sufficient detail and analysis?

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
[What the report does well]

### Gaps Identified
[What's missing - be specific]

### Follow-up Queries
[If gaps exist, list specific search queries]

### Verdict
**[APPROVED]** - Ready for delivery
OR
**[NEEDS_REVISION]** - Changes needed: [list]
OR  
**[NEEDS_MORE_RESEARCH]** - Research needed on: [topics]`;

export class QualityReviewerTool extends BaseTool {
  name = "quality_reviewer";
  description = `Evaluate if a report is helpful and complete.
Returns scores, gaps, and follow-up queries if more research is needed.
Verdict: APPROVED, NEEDS_REVISION, or NEEDS_MORE_RESEARCH.`;

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
      tools: [],
      config: SPECIALIST_CONFIG,
    });

    const result = await reviewerAgent.run(
      `Review this report for: "${question}"\n\nReport:\n${report}`
    );
    return result;
  }
}

// ============================================
// 6. REPORT EXTENDER - Integrates new findings
// ============================================
const REPORT_EXTENDER_PROMPT = `You are a Report Extension Specialist.

Your job is to EXTEND an existing report with new information, NOT rewrite it.

EXTENSION RULES:
1. Keep all existing content intact
2. Add new information in appropriate sections
3. Update conclusions if new evidence changes them
4. Add new sources to the citation list (continue numbering)
5. Maintain consistent tone and formatting

DO NOT rewrite sections that don't need updating.

Output the complete updated report.`;

export class ReportExtenderTool extends BaseTool {
  name = "report_extender";
  description = `Extend an existing report with new research findings.
Seamlessly integrates new information without rewriting.`;

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
      description: "Which gaps are being addressed",
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
        maxTokens: 24000,
      },
    });

    const result = await extenderAgent.run(
      `Extend this report.\n\nGaps: ${gaps}\n\nExisting Report:\n${existingReport}\n\nNew Findings:\n${newFindings}`
    );
    return result;
  }
}

// ============================================
// 7. REPORT COMPILER - Assembles final report
// ============================================
export class ReportCompilerTool extends BaseTool {
  name = "report_compiler";
  description = `Compile multiple sections into a final report.
Use after all sections are written to create the final document.
Deduplicates sources and adds consistent formatting.`;

  parameters = {
    title: {
      type: "string",
      description: "Report title",
    },
    sections: {
      type: "string",
      description: "All written sections concatenated",
    },
    sources: {
      type: "string",
      description: "All sources used",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const title = args.title as string;
    const sections = args.sections as string;
    const sources = args.sources as string;

    // Deduplicate sources
    const sourceLines = sources.split("\n").filter((l) => l.trim());
    const unique = deduplicateCitations(sourceLines);
    const numbered = unique.map((s, i) => {
      const cleaned = s.replace(/^\[\d+\]\s*/, "");
      return `[${i + 1}] ${cleaned}`;
    });

    return [
      `# ${title}`,
      ``,
      `---`,
      ``,
      sections,
      ``,
      `---`,
      ``,
      `## References`,
      ``,
      ...numbered,
      ``,
      `---`,
      `*Generated by NVIDIA CLI Multi-Agent Coordinator*`,
    ].join("\n");
  }
}

// ============================================
// 8. SOURCE DEDUPLICATOR - Utility tool
// ============================================
export class SourceDeduplicatorTool extends BaseTool {
  name = "deduplicate_sources";
  description = `Clean up and deduplicate a list of sources/citations.`;

  parameters = {
    sources: {
      type: "string",
      description: "Raw list of sources to deduplicate",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const sourcesRaw = args.sources as string;
    const lines = sourcesRaw.split("\n").filter((l) => l.trim());
    const unique = deduplicateCitations(lines);
    const numbered = unique.map((s, i) => {
      const cleaned = s.replace(/^\[\d+\]\s*/, "").replace(/^\d+\.\s*/, "");
      return `[${i + 1}] ${cleaned}`;
    });
    return `## Deduplicated Sources (${numbered.length} unique)\n\n${numbered.join("\n")}`;
  }
}
