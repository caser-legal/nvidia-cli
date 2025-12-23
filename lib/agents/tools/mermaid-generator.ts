// Mermaid Diagram Generator Tool
// Auto-generate architecture and flow diagrams from code analysis

import { BaseTool } from "../base-tool";
import { Agent } from "../agent";

// Specialist prompt for diagram generation
const DIAGRAM_GENERATOR_PROMPT = `You are a Mermaid Diagram Specialist.

Your job is to create clear, accurate Mermaid diagrams from code or descriptions.

DIAGRAM TYPES YOU CAN CREATE:
1. flowchart - Process flows, decision trees
2. sequenceDiagram - API calls, message passing
3. classDiagram - Class relationships, inheritance
4. erDiagram - Database schemas
5. stateDiagram-v2 - State machines
6. graph - General graphs (LR, TD, TB)

RULES:
- Use clear, descriptive node labels
- Keep diagrams readable (max 15-20 nodes)
- Use appropriate arrow types (-->, --o, --|>)
- Add subgraphs for grouping related components
- Include a title comment at the top

OUTPUT FORMAT:
\`\`\`mermaid
%% Title: [Diagram Name]
[diagram code]
\`\`\`

Always output ONLY the mermaid code block, nothing else.`;

export class MermaidGeneratorTool extends BaseTool {
  name = "mermaid_generator";
  description = `Generate Mermaid diagrams from code analysis or descriptions.
Types: flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, graph
Use for: architecture diagrams, API flows, class hierarchies, database schemas`;

  parameters = {
    diagram_type: {
      type: "string",
      enum: ["flowchart", "sequenceDiagram", "classDiagram", "erDiagram", "stateDiagram", "graph", "auto"],
      description: "Type of diagram to generate (auto = let AI decide)",
    },
    description: {
      type: "string",
      description: "Description of what to diagram OR code to analyze",
    },
    title: {
      type: "string",
      description: "Title for the diagram",
      optional: true,
    },
  };

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const diagramType = args.diagram_type as string;
    const description = args.description as string;
    const title = (args.title as string) || "Diagram";

    // Nemotron 3 Nano for diagram generation - best reasoning and instruction following
    const agent = new Agent({
      apiKey: this.apiKey,
      systemPrompt: DIAGRAM_GENERATOR_PROMPT,
      tools: [],
      config: {
        model: "nvidia/nemotron-3-nano-30b-a3b",
        maxTokens: 4096,
        temperature: 0.7,
        topP: 1.0,
      },
    });

    const typeHint = diagramType === "auto" 
      ? "Choose the most appropriate diagram type."
      : `Create a ${diagramType} diagram.`;

    const result = await agent.run(
      `${typeHint}

Title: ${title}

Based on this:
${description}

Generate ONLY the mermaid code block.`
    );

    return result;
  }
}

// Quick diagram templates for common patterns
export class QuickDiagramTool extends BaseTool {
  name = "quick_diagram";
  description = `Generate common diagram patterns quickly without AI.
Templates: api_flow, crud_flow, auth_flow, microservices, class_hierarchy, state_machine`;

  parameters = {
    template: {
      type: "string",
      enum: ["api_flow", "crud_flow", "auth_flow", "microservices", "class_hierarchy", "state_machine"],
      description: "Diagram template to use",
    },
    entities: {
      type: "string",
      description: "Comma-separated list of entities/components to include",
    },
    title: {
      type: "string",
      description: "Diagram title",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const template = args.template as string;
    const entities = (args.entities as string).split(",").map(e => e.trim());
    const title = (args.title as string) || template.replace("_", " ").toUpperCase();

    switch (template) {
      case "api_flow":
        return this.apiFlow(title, entities);
      case "crud_flow":
        return this.crudFlow(title, entities);
      case "auth_flow":
        return this.authFlow(title);
      case "microservices":
        return this.microservices(title, entities);
      case "class_hierarchy":
        return this.classHierarchy(title, entities);
      case "state_machine":
        return this.stateMachine(title, entities);
      default:
        return "Unknown template";
    }
  }

  private apiFlow(title: string, entities: string[]): string {
    const [client = "Client", api = "API", db = "Database"] = entities;
    return `\`\`\`mermaid
%% Title: ${title}
sequenceDiagram
    participant ${client}
    participant ${api}
    participant ${db}
    
    ${client}->>+${api}: Request
    ${api}->>+${db}: Query
    ${db}-->>-${api}: Data
    ${api}-->>-${client}: Response
\`\`\``;
  }

  private crudFlow(title: string, entities: string[]): string {
    const [entity = "Item"] = entities;
    return `\`\`\`mermaid
%% Title: ${title}
flowchart LR
    subgraph CRUD Operations
        C[Create ${entity}] --> DB[(Database)]
        R[Read ${entity}] --> DB
        U[Update ${entity}] --> DB
        D[Delete ${entity}] --> DB
    end
    
    User --> C
    User --> R
    User --> U
    User --> D
\`\`\``;
  }

  private authFlow(title: string): string {
    return `\`\`\`mermaid
%% Title: ${title}
sequenceDiagram
    participant User
    participant App
    participant Auth
    participant API
    
    User->>App: Login Request
    App->>Auth: Authenticate
    Auth-->>App: Token
    App-->>User: Logged In
    
    User->>App: API Request
    App->>API: Request + Token
    API->>Auth: Validate Token
    Auth-->>API: Valid
    API-->>App: Response
    App-->>User: Data
\`\`\``;
  }

  private microservices(title: string, services: string[]): string {
    if (services.length < 2) {
      services = ["ServiceA", "ServiceB", "ServiceC"];
    }
    const connections = services.slice(1).map((s) => 
      `    ${services[0]} --> ${s}`
    ).join("\n");
    
    return `\`\`\`mermaid
%% Title: ${title}
flowchart TB
    subgraph Gateway
        API[API Gateway]
    end
    
    subgraph Services
${services.map(s => `        ${s}[${s}]`).join("\n")}
    end
    
    subgraph Data
        DB[(Database)]
        Cache[(Cache)]
    end
    
    API --> ${services[0]}
${connections}
    ${services[services.length - 1]} --> DB
    ${services[0]} --> Cache
\`\`\``;
  }

  private classHierarchy(title: string, classes: string[]): string {
    if (classes.length < 2) {
      classes = ["BaseClass", "ChildA", "ChildB"];
    }
    const [base, ...children] = classes;
    
    return `\`\`\`mermaid
%% Title: ${title}
classDiagram
    class ${base} {
        +id: string
        +createdAt: Date
        +save()
        +delete()
    }
    
${children.map(c => `    class ${c} {
        +specificField: string
        +specificMethod()
    }
    ${base} <|-- ${c}`).join("\n\n")}
\`\`\``;
  }

  private stateMachine(title: string, states: string[]): string {
    if (states.length < 2) {
      states = ["Idle", "Processing", "Complete", "Error"];
    }
    
    const transitions = states.slice(0, -1).map((s, i) => 
      `    ${s} --> ${states[i + 1]}: next`
    ).join("\n");
    
    return `\`\`\`mermaid
%% Title: ${title}
stateDiagram-v2
    [*] --> ${states[0]}
${transitions}
    ${states[states.length - 1]} --> [*]
    
    ${states[states.length - 2] || states[0]} --> ${states[0]}: reset
\`\`\``;
  }
}
