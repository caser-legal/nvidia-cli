// Agent Framework Types
// Core types for the agent system - used by all agent implementations

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface AgentConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  contextWindowTokens: number;
}

export interface AgentSession {
  id: string;
  projectDir: string;
  status: "idle" | "running" | "paused" | "completed" | "error";
  iteration: number;
  startedAt: Date;
  lastActivityAt: Date;
}

export interface FeatureItem {
  id: string;
  description: string;
  category: string;
  passes: boolean;
  notes?: string;
}

// Tool execution interface
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  toDefinition: () => ToolDefinition;
}

// Agent events for streaming updates to UI
export type AgentEvent =
  | { type: "status"; status: AgentSession["status"] }
  | { type: "message"; role: "user" | "assistant"; content: string }
  | { type: "tool_call"; name: string; args: string }
  | { type: "tool_result"; name: string; result: string; is_error?: boolean }
  | { type: "iteration"; number: number }
  | { type: "progress"; passing: number; total: number }
  | { type: "error"; message: string }
  | { type: "complete"; summary: string };
