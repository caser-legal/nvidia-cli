// Base Tool Class
// All agent tools extend this base class

import type { Tool, ToolDefinition } from "./types";
import { z, ZodSchema } from "zod";

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;
  
  // Optional zod schema for validation
  protected schema?: ZodSchema;

  abstract execute(args: Record<string, unknown>): Promise<string>;
  
  // Validate args against schema if defined
  protected validate(args: Record<string, unknown>): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
    if (!this.schema) return { success: true, data: args };
    
    const result = this.schema.safeParse(args);
    if (result.success) {
      return { success: true, data: result.data as Record<string, unknown> };
    }
    return { success: false, error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') };
  }

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

// Re-export zod for tools to use
export { z };
