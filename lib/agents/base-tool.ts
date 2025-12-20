// Base Tool Class
// All agent tools extend this base class

import type { Tool, ToolDefinition } from "./types";

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;

  abstract execute(args: Record<string, unknown>): Promise<string>;

  toDefinition(): ToolDefinition {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: this.parameters,
          required: Object.keys(this.parameters).filter(
            (k) => !(this.parameters[k] as { optional?: boolean })?.optional
          ),
        },
      },
    };
  }
}
