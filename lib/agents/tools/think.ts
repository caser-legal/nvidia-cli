// Think Tool
// Internal reasoning without external actions

import { BaseTool } from "../base-tool";

export class ThinkTool extends BaseTool {
  name = "think";
  description = `Use this tool to think about something. It will not obtain new information or change files, but just append the thought to the log. Use it when complex reasoning or planning is needed.`;

  parameters = {
    thought: {
      type: "string",
      description: "A thought to think about",
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_args: Record<string, unknown>): Promise<string> {
    // The thought is logged but we just acknowledge it
    return "Thinking complete.";
  }
}
