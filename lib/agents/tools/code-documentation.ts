// Code Documentation Generator
// Multi-agent workflow for generating comprehensive documentation

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";
import { GitHubAnalyzerTool, GitHubFileReaderTool } from "./github-analyzer";
import { MermaidGeneratorTool } from "./mermaid-generator";
import { MemoryTool } from "./memory";

// Specialist prompts
const CODEBASE_ANALYST_PROMPT = `You are a Codebase Analyst specializing in understanding software architecture.

Your job is to analyze a codebase and identify:
1. Project structure and organization
2. Main components and their responsibilities
3. Key dependencies and technologies
4. Entry points and main flows
5. Configuration patterns

Output a structured analysis with clear sections.`;

const DOCUMENTATION_PLANNER_PROMPT = `You are a Documentation Planner.

Given a codebase analysis, create a documentation plan with:
1. README structure (sections needed)
2. Architecture documentation outline
3. API documentation needs
4. Setup/installation guide outline
5. Component documentation priorities

Be specific about what each section should cover.`;

const DOCUMENTATION_WRITER_PROMPT = `You are a Technical Documentation Writer.

Write clear, comprehensive documentation following these principles:
1. Start with a clear overview
2. Use code examples where helpful
3. Include diagrams (mermaid) for complex flows
4. Write for developers of varying experience levels
5. Include troubleshooting tips where relevant

Output well-formatted Markdown.`;

// Main documentation generator tool
export class CodeDocumentationTool extends BaseTool {
  name = "code_documentation";
  description = `Generate comprehensive documentation for a codebase.
Operations:
- analyze: Analyze codebase structure
- plan: Create documentation plan
- readme: Generate README.md
- architecture: Generate architecture docs
- api: Generate API documentation
- full: Complete documentation suite`;

  parameters = {
    operation: {
      type: "string",
      enum: ["analyze", "plan", "readme", "architecture", "api", "full"],
      description: "Documentation operation",
    },
    repo_url: {
      type: "string",
      description: "GitHub repository URL",
      optional: true,
    },
    local_path: {
      type: "string",
      description: "Local project path (alternative to repo_url)",
      optional: true,
    },
    project_name: {
      type: "string",
      description: "Project name for documentation",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;
    const repoUrl = args.repo_url as string;
    const localPath = args.local_path as string;
    const projectName = (args.project_name as string) || "Project";

    if (!repoUrl && !localPath) {
      return "Error: Either repo_url or local_path is required";
    }

    try {
      switch (operation) {
        case "analyze":
          return await this.analyzeCodebase(repoUrl, localPath);
        case "plan":
          return await this.createPlan(repoUrl, localPath);
        case "readme":
          return await this.generateReadme(repoUrl, localPath, projectName);
        case "architecture":
          return await this.generateArchitecture(repoUrl, localPath, projectName);
        case "api":
          return await this.generateApiDocs(repoUrl, localPath, projectName);
        case "full":
          return await this.generateFullDocs(repoUrl, localPath, projectName);
        default:
          return `Unknown operation: ${operation}`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async analyzeCodebase(repoUrl?: string, localPath?: string): Promise<string> {
    // Super-49B for code analysis - best instruction following (IFEval 88.6%)
    const analyst = new Agent({
      apiKey: this.apiKey,
      systemPrompt: CODEBASE_ANALYST_PROMPT,
      tools: repoUrl ? [new GitHubAnalyzerTool(), new GitHubFileReaderTool()] : [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 8192,
        temperature: 0.7,
      },
    });

    if (repoUrl) {
      return await analyst.run(
        `Analyze this GitHub repository: ${repoUrl}

Use github_analyzer with operation "analyze" first, then read key files to understand the codebase.
Provide a comprehensive analysis.`
      );
    } else {
      return await analyst.run(
        `Analyze the codebase at: ${localPath}

Examine the directory structure, key files, and dependencies.
Provide a comprehensive analysis.`
      );
    }
  }

  private async createPlan(repoUrl?: string, localPath?: string): Promise<string> {
    // First analyze
    const analysis = await this.analyzeCodebase(repoUrl, localPath);

    const planner = new Agent({
      apiKey: this.apiKey,
      systemPrompt: DOCUMENTATION_PLANNER_PROMPT,
      tools: [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 4096,
        temperature: 0.7,
      },
    });

    return await planner.run(
      `Based on this codebase analysis, create a documentation plan:

${analysis}

Create a detailed plan for what documentation should be created.`
    );
  }

  private async generateReadme(repoUrl?: string, localPath?: string, projectName?: string): Promise<string> {
    const analysis = await this.analyzeCodebase(repoUrl, localPath);

    const writer = new Agent({
      apiKey: this.apiKey,
      systemPrompt: DOCUMENTATION_WRITER_PROMPT,
      tools: [new MermaidGeneratorTool(this.apiKey)],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 8192,
        temperature: 0.7,
      },
    });

    return await writer.run(
      `Generate a comprehensive README.md for "${projectName}" based on this analysis:

${analysis}

Include:
1. Project title and badges
2. Overview/description
3. Features list
4. Installation instructions
5. Usage examples
6. Configuration
7. Architecture diagram (use mermaid_generator)
8. Contributing guidelines
9. License

Output complete Markdown.`
    );
  }

  private async generateArchitecture(repoUrl?: string, localPath?: string, projectName?: string): Promise<string> {
    const analysis = await this.analyzeCodebase(repoUrl, localPath);

    const writer = new Agent({
      apiKey: this.apiKey,
      systemPrompt: DOCUMENTATION_WRITER_PROMPT,
      tools: [new MermaidGeneratorTool(this.apiKey)],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 8192,
        temperature: 0.7,
      },
    });

    return await writer.run(
      `Generate architecture documentation for "${projectName}" based on this analysis:

${analysis}

Include:
1. System overview
2. Component diagram (mermaid)
3. Data flow diagram (mermaid)
4. Key components description
5. Dependencies and integrations
6. Deployment architecture
7. Security considerations

Use mermaid_generator for diagrams. Output complete Markdown.`
    );
  }

  private async generateApiDocs(repoUrl?: string, localPath?: string, projectName?: string): Promise<string> {
    const analysis = await this.analyzeCodebase(repoUrl, localPath);

    const writer = new Agent({
      apiKey: this.apiKey,
      systemPrompt: DOCUMENTATION_WRITER_PROMPT,
      tools: repoUrl ? [new GitHubFileReaderTool()] : [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 8192,
        temperature: 0.7,
      },
    });

    return await writer.run(
      `Generate API documentation for "${projectName}" based on this analysis:

${analysis}

Include:
1. API overview
2. Authentication (if applicable)
3. Endpoints/methods with:
   - Description
   - Parameters
   - Request/response examples
   - Error codes
4. Rate limits (if applicable)
5. SDK/client examples

Output complete Markdown.`
    );
  }

  private async generateFullDocs(repoUrl?: string, localPath?: string, projectName?: string): Promise<string> {
    const results: string[] = [];

    results.push(`# ${projectName} Documentation\n`);
    results.push("---\n");

    // Generate each section
    results.push("## README\n");
    results.push(await this.generateReadme(repoUrl, localPath, projectName));
    results.push("\n---\n");

    results.push("## Architecture\n");
    results.push(await this.generateArchitecture(repoUrl, localPath, projectName));
    results.push("\n---\n");

    results.push("## API Reference\n");
    results.push(await this.generateApiDocs(repoUrl, localPath, projectName));

    return results.join("\n");
  }
}

// Documentation specialist agent tool (for coordinator mode)
export class DocumentationSpecialistTool extends BaseTool {
  name = "documentation_specialist";
  description = `Call the Documentation Specialist to analyze code and generate documentation.
Supports GitHub repos and local projects.`;

  parameters = {
    task: {
      type: "string",
      description: "What documentation to generate (readme, architecture, api, full)",
    },
    source: {
      type: "string",
      description: "GitHub URL or local path",
    },
    project_name: {
      type: "string",
      description: "Project name",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const task = args.task as string;
    const source = args.source as string;
    const projectName = (args.project_name as string) || "Project";

    const docTool = new CodeDocumentationTool(this.apiKey);

    const isGitHub = source.includes("github.com");
    
    return await docTool.execute({
      operation: task,
      repo_url: isGitHub ? source : undefined,
      local_path: isGitHub ? undefined : source,
      project_name: projectName,
    });
  }
}
