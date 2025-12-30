/**
 * MCP Tool Wrapper
 * Wraps tool execution with flywheel logging and PII protection
 */

import { FlywheelLogger, ToolCallRecord } from "./agents/flywheel/logger";
import { PIIGuard } from "./security/pii-guard";
import { createLogger } from "./logger";

const log = createLogger("MCPToolWrapper");

export interface ToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Wrap a tool execution with flywheel logging
 */
export async function wrapToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  executor: () => Promise<string>,
  flywheelLogger: FlywheelLogger,
  piiGuard?: PIIGuard
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  let result: string;
  let success = true;
  let error: string | undefined;

  try {
    // Execute the tool
    result = await executor();
    
    // Redact PII from result if guard provided
    if (piiGuard && piiGuard.containsPII(result)) {
      result = piiGuard.redact(result);
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
    result = `Error: ${error}`;
  }

  const durationMs = Date.now() - startTime;

  // Log to flywheel (simplified - just tool call, not full interaction)
  // Full interaction logging happens in dory_agent
  log.debug(`Tool ${toolName} executed`, { success, durationMs });

  return {
    content: [{ type: "text", text: result }],
  };
}

/**
 * Create a wrapped tool handler for MCP server
 */
export function createWrappedHandler<T extends Record<string, unknown>>(
  toolName: string,
  tool: { execute: (args: T) => Promise<string> },
  flywheelLogger: FlywheelLogger,
  piiGuard?: PIIGuard
): (args: T) => Promise<ToolExecutionResult> {
  return async (args: T) => {
    return wrapToolExecution(
      toolName,
      args as Record<string, unknown>,
      () => tool.execute(args),
      flywheelLogger,
      piiGuard
    );
  };
}
