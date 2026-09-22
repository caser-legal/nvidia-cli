import { NextRequest, NextResponse } from "next/server";
import { MCPAgent } from "@/lib/agents/mcp-agent";

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools via MCP.
Use tools when needed to help the user. Be concise and direct.`;

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const agent = new MCPAgent({ systemPrompt: SYSTEM_PROMPT });
    const response = await agent.run(message, conversationHistory);
    
    return NextResponse.json({
      response,
      conversationHistory: agent.getHistory(),
    });
  } catch (error) {
    console.error("MCP chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
