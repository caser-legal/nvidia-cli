// Report Planner Tool
// Creates structured outline before writing - from NVIDIA workshop pattern

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";

const REPORT_PLANNER_PROMPT = `You are a Report Planner Specialist.

Your job is to create a structured outline for a research report BEFORE any writing begins.

Given a topic and initial research findings, you must:
1. Identify the key themes and subtopics
2. Create a logical section structure
3. Determine which sections need additional research
4. Estimate the depth needed for each section

Output a JSON structure with the report plan:
{
  "title": "Report title",
  "sections": [
    {
      "name": "Section name",
      "description": "What this section covers",
      "research_needed": true/false,
      "research_queries": ["query1", "query2"] // if research_needed is true
    }
  ],
  "estimated_length": "brief|standard|comprehensive"
}

PLANNING PRINCIPLES:
- Start with an Introduction that sets context
- Group related topics into coherent sections
- End with Conclusion that synthesizes findings
- Mark sections as research_needed=true if initial research is insufficient
- Provide specific research_queries for sections needing more data

Output ONLY valid JSON, nothing else.`;

export interface ReportSection {
  name: string;
  description: string;
  research_needed: boolean;
  research_queries?: string[];
  content?: string;
}

export interface ReportPlan {
  title: string;
  sections: ReportSection[];
  estimated_length: "brief" | "standard" | "comprehensive";
}

export class ReportPlannerTool extends BaseTool {
  name = "report_planner";
  description = `Create a structured outline for a research report before writing.
Use this after initial research to plan the report structure.
Returns a JSON plan with sections, descriptions, and research needs.
This ensures comprehensive coverage and identifies gaps early.`;

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

    // Nemotron 3 Nano for report planning - best reasoning and instruction following
    const plannerAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: REPORT_PLANNER_PROMPT,
      tools: [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 4096,
        temperature: 1.0,
        topP: 1.0,
        contextWindowTokens: 128000,
      },
    });

    const prompt = `Create a ${style} report plan for this topic: "${topic}"

Based on this initial research:
${research}

Output the plan as JSON.`;

    try {
      const result = await plannerAgent.run(prompt);

      // Try to parse JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as ReportPlan;

        // Format as readable output
        const output: string[] = [
          `## Report Plan: ${plan.title}`,
          `**Estimated Length:** ${plan.estimated_length}`,
          `**Sections:** ${plan.sections.length}`,
          ``,
          `### Outline:`,
          ``,
        ];

        plan.sections.forEach((section, i) => {
          output.push(`**${i + 1}. ${section.name}**`);
          output.push(`   ${section.description}`);
          if (section.research_needed) {
            output.push(`   ⚠️ Needs additional research:`);
            section.research_queries?.forEach((q) => {
              output.push(`      - "${q}"`);
            });
          } else {
            output.push(`   ✅ Sufficient research available`);
          }
          output.push(``);
        });

        // Also include raw JSON for downstream processing
        output.push(`---`);
        output.push(`### Raw Plan (JSON):`);
        output.push("```json");
        output.push(JSON.stringify(plan, null, 2));
        output.push("```");

        return output.join("\n");
      }

      return `## Report Plan\n\n${result}`;
    } catch (error) {
      return `Report planning error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Section Author Tool - writes individual sections with optional research
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

If the section needs research but none is provided, note what information is missing.

Output the section content in markdown format.`;

export class SectionAuthorTool extends BaseTool {
  name = "section_author";
  description = `Write a single section of a report.
Use this to write individual sections based on the report plan.
Can be called in parallel for multiple sections.
Includes citations and connects to overall report narrative.`;

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

    // Nemotron 3 Nano for section authoring - best for writing quality
    const authorAgent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: SECTION_AUTHOR_PROMPT,
      tools: [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 8192,
        temperature: 1.0,
        topP: 1.0,
        contextWindowTokens: 128000,
      },
    });

    const prompt = `Write the "${sectionName}" section.

**Section Description:** ${description}

**Report Context:** ${context || "General research report"}

**Available Research:**
${research}

Write the section content in markdown format with proper citations.`;

    try {
      const result = await authorAgent.run(prompt);
      return `## ${sectionName}\n\n${result}`;
    } catch (error) {
      return `Section writing error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Report Compiler Tool - assembles sections into final report
export class ReportCompilerTool extends BaseTool {
  name = "report_compiler";
  description = `Compile multiple sections into a final, cohesive report.
Use this after all sections are written to create the final document.
Adds transitions, ensures consistency, and creates unified citations.`;

  parameters = {
    title: {
      type: "string",
      description: "Report title",
    },
    sections: {
      type: "string",
      description: "All written sections concatenated together",
    },
    sources: {
      type: "string",
      description: "All sources used across sections",
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const title = args.title as string;
    const sections = args.sections as string;
    const sources = args.sources as string;

    // Parse and deduplicate sources
    const sourceLines = sources.split("\n").filter((l) => l.trim());
    const uniqueSources = [...new Set(sourceLines)];

    // Renumber sources
    const numberedSources = uniqueSources.map((s, i) => {
      const cleaned = s.replace(/^\[\d+\]\s*/, "");
      return `[${i + 1}] ${cleaned}`;
    });

    // Compile final report
    const report = [
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
      ...numberedSources,
      ``,
      `---`,
      `*Report generated by NVIDIA CLI Multi-Agent Coordinator*`,
    ];

    return report.join("\n");
  }
}
