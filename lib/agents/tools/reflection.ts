// Reflection Tool
// Analyzes a report to identify knowledge gaps and generate follow-up queries

import { BaseTool } from "../base-tool";
import { SimpleAgent as Agent } from "../simple-agent";

const REFLECTION_PROMPT = `You are a Critical Reviewer Agent.

Your ONLY job is to analyze a report and identify knowledge gaps.

When reviewing a report:
1. Check if all aspects of the original question are addressed
2. Identify missing information or shallow coverage
3. Find claims that need more evidence or sources
4. Spot areas where more depth would improve the report
5. Generate specific follow-up search queries to fill gaps

Be specific and actionable. Don't just say "needs more detail" - say exactly what's missing.

Format your response as JSON:
{
  "gaps_identified": [
    {
      "section": "Which part of the report",
      "issue": "What's missing or weak",
      "importance": "high|medium|low"
    }
  ],
  "follow_up_queries": [
    "Specific search query to fill gap 1",
    "Specific search query to fill gap 2"
  ],
  "coverage_score": 7,
  "recommendation": "NEEDS_MORE_RESEARCH" | "SUFFICIENT"
}

Only output valid JSON, nothing else.`;

interface ReflectionResult {
  gaps_identified: Array<{
    section: string;
    issue: string;
    importance: "high" | "medium" | "low";
  }>;
  follow_up_queries: string[];
  coverage_score: number;
  recommendation: "NEEDS_MORE_RESEARCH" | "SUFFICIENT";
}

export class ReflectionTool extends BaseTool {
  name = "reflect_on_report";
  description = `Analyze a report to identify knowledge gaps and generate follow-up queries.
Use this after creating a report to check if more research is needed.
Returns a list of gaps and specific search queries to fill them.
If coverage_score >= 8 and recommendation is SUFFICIENT, the report is ready.`;

  parameters = {
    original_question: {
      type: "string",
      description: "The original user question/request",
    },
    report: {
      type: "string",
      description: "The report to analyze for gaps",
    },
    sources_used: {
      type: "string",
      description: "List of sources already used in the report",
      optional: true,
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
    const sources = (args.sources_used as string) || "Not provided";

    // Nemotron 3 Nano for reflection - best reasoning for analysis
    const reflectionAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REFLECTION_PROMPT,
      tools: [], // No tools - pure analysis
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 4096,
        temperature: 1.0,
        topP: 1.0,
        contextWindowTokens: 128000,
      },
    });

    const prompt = `Analyze this report for the question: "${question}"

## Report to Analyze:
${report}

## Sources Already Used:
${sources}

Identify gaps and generate follow-up queries. Output only valid JSON.`;

    try {
      const result = await reflectionAgent.run(prompt);
      
      // Try to parse JSON from the response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ReflectionResult;
        
        // Format as readable output
        const output: string[] = [
          `## Reflection Analysis`,
          ``,
          `**Coverage Score:** ${parsed.coverage_score}/10`,
          `**Recommendation:** ${parsed.recommendation}`,
          ``,
        ];

        if (parsed.gaps_identified.length > 0) {
          output.push(`### Knowledge Gaps Identified:`);
          parsed.gaps_identified.forEach((gap, i) => {
            output.push(`${i + 1}. **[${gap.importance.toUpperCase()}]** ${gap.section}`);
            output.push(`   Issue: ${gap.issue}`);
          });
          output.push(``);
        }

        if (parsed.follow_up_queries.length > 0) {
          output.push(`### Follow-up Queries to Fill Gaps:`);
          parsed.follow_up_queries.forEach((query, i) => {
            output.push(`${i + 1}. "${query}"`);
          });
          output.push(``);
        }

        if (parsed.recommendation === "SUFFICIENT") {
          output.push(`✅ **Report is ready for delivery.**`);
        } else {
          output.push(`⚠️ **More research recommended.** Use the follow-up queries above.`);
        }

        return output.join("\n");
      }
      
      // If JSON parsing fails, return raw result
      return `## Reflection Analysis\n\n${result}`;
      
    } catch (error) {
      return `Reflection error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Extended Report Writer that can incorporate new findings
const EXTENDED_REPORT_WRITER_PROMPT = `You are a Report Extension Specialist.

Your job is to EXTEND an existing report with new information.

When given:
- An existing report
- New research findings

You should:
1. Identify where new information fits in the existing structure
2. Seamlessly integrate new content without duplicating existing info
3. Update any conclusions based on new evidence
4. Add new sources to the citations
5. Maintain consistent tone and formatting

Do NOT rewrite the entire report - only add/modify sections that benefit from new info.
Mark new additions with subtle integration, not obvious "UPDATE:" markers.

Output the complete updated report with new information integrated.`;

export class ExtendReportTool extends BaseTool {
  name = "extend_report";
  description = `Extend an existing report with new research findings.
Use this after reflection identifies gaps and new searches fill them.
Seamlessly integrates new information into the existing report structure.`;

  parameters = {
    existing_report: {
      type: "string",
      description: "The current report to extend",
    },
    new_findings: {
      type: "string",
      description: "New research findings to integrate",
    },
    gaps_addressed: {
      type: "string",
      description: "Which gaps from reflection are being addressed",
      optional: true,
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
    const gapsAddressed = (args.gaps_addressed as string) || "General improvements";

    // Nemotron 3 Nano for report extension - best writing quality
    const extenderAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: EXTENDED_REPORT_WRITER_PROMPT,
      tools: [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 16384,
        temperature: 1.0,
        topP: 1.0,
        contextWindowTokens: 128000,
      },
    });

    const prompt = `Extend this report with new findings.

## Gaps Being Addressed:
${gapsAddressed}

## Existing Report:
${existingReport}

## New Research Findings to Integrate:
${newFindings}

Output the complete updated report with new information seamlessly integrated.`;

    try {
      const result = await extenderAgent.run(prompt);
      return result;
    } catch (error) {
      return `Report extension error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
