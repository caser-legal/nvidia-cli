// API Route: Chat Completions with Streaming
// Features 2, 9, 118-122

import { streamChatCompletion, checkRateLimit, recordRequest, type ChatMessage, type ModelId } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      messages,
      model = "nvidia/nemotron-3-nano",
      temperature = 1,
      maxTokens = 16384,
      topP = 1,
      systemPrompt,
      stream = true,
    } = body as {
      messages: ChatMessage[];
      model?: ModelId;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      systemPrompt?: string;
      stream?: boolean;
    };

    // Check rate limit (40 RPM for free tier)
    const rateLimit = checkRateLimit();
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          remaining: rateLimit.remaining,
          resetIn: rateLimit.resetIn,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.resetIn),
          },
        }
      );
    }

    // Record the request
    recordRequest();

    // Prepare messages with system prompt
    const allMessages: ChatMessage[] = [];
    
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    
    allMessages.push(...messages);

    // Get API key from environment or request header
    const apiKey = request.headers.get("X-NVIDIA-API-Key") || process.env.NVIDIA_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (stream) {
      // Feature 2: Streaming response
      const encoder = new TextEncoder();
      
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let inputTokens = 0;
            let outputTokens = 0;
            
            for await (const chunk of streamChatCompletion(
              {
                model,
                messages: allMessages,
                temperature,
                maxTokens,
                topP,
                stream: true,
              },
              apiKey
            )) {
              const content = chunk.choices[0]?.delta?.content;
              
              if (content) {
                // Send SSE format
                const data = JSON.stringify({
                  type: "content",
                  content,
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
              
              // Check for finish
              if (chunk.choices[0]?.finish_reason) {
                const finishData = JSON.stringify({
                  type: "finish",
                  finish_reason: chunk.choices[0].finish_reason,
                  usage: {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                  },
                });
                controller.enqueue(encoder.encode(`data: ${finishData}\n\n`));
              }
            }
            
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const errorData = JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-RateLimit-Remaining": String(rateLimit.remaining - 1),
        },
      });
    } else {
      // Non-streaming response
      const { createChatCompletion } = await import("@/lib/nvidia");
      
      const response = await createChatCompletion(
        {
          model,
          messages: allMessages,
          temperature,
          maxTokens,
          topP,
          stream: false,
        },
        apiKey
      );

      return new Response(JSON.stringify(response), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining - 1),
        },
      });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
