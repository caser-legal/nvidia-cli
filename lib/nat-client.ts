/**
 * NeMo Agent Toolkit Client
 * Bridges the Next.js frontend to the NAT Python backend
 */

import { createLogger } from "./logger";

const log = createLogger("NAT");

export interface NATMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface NATResponse {
  value: string;
  intermediate_steps?: IntermediateStep[];
}

export interface IntermediateStep {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: string;
}

export interface NATStreamChunk {
  type: 'token' | 'tool_start' | 'tool_end' | 'done' | 'error';
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
}

const NAT_BASE_URL = "" || 'http://localhost:8000';

export async function isNATAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${NAT_BASE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendToNAT(input: string): Promise<NATResponse> {
  const response = await fetch(`${NAT_BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_message: input }),
  });

  if (!response.ok) throw new Error(`NAT request failed: ${response.statusText}`);
  return response.json();
}

export async function chatWithNAT(messages: NATMessage[], stream = false): Promise<Response> {
  const response = await fetch(`${NAT_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream, model: 'dory' }),
  });

  if (!response.ok) throw new Error(`NAT chat request failed: ${response.statusText}`);
  return response;
}

export function streamFromNAT(input: string, onChunk: (chunk: NATStreamChunk) => void, onError?: (error: Error) => void, onComplete?: () => void): () => void {
  const ws = new WebSocket(`ws://localhost:8000/websocket`);
  
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'chat_completions', messages: [{ role: 'user', content: input }], stream: true }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.choices?.[0]?.delta?.content) {
        onChunk({ type: 'token', content: data.choices[0].delta.content });
      } else if (data.choices?.[0]?.finish_reason === 'stop') {
        onChunk({ type: 'done' });
        onComplete?.();
      } else if (data.intermediate_step) {
        const step = data.intermediate_step;
        onChunk({ type: step.status === 'started' ? 'tool_start' : 'tool_end', tool: step.tool, input: step.input, output: step.output });
      }
    } catch (e) {
      log.error('Failed to parse NAT message', { error: String(e) });
    }
  };

  ws.onerror = () => { onError?.(new Error('WebSocket error')); };
  ws.onclose = () => { onComplete?.(); };

  return () => ws.close();
}

export class HybridAgentClient {
  private natAvailable: boolean | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    this.natAvailable = await isNATAvailable();
    this.checkInterval = setInterval(async () => { this.natAvailable = await isNATAvailable(); }, 30000);
  }

  destroy(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }

  isNATMode(): boolean {
    return this.natAvailable === true;
  }

  async send(input: string): Promise<{ response: string; source: 'nat' | 'ts' }> {
    if (this.natAvailable) {
      try {
        const result = await sendToNAT(input);
        return { response: result.value, source: 'nat' };
      } catch (error) {
        log.warn('NAT request failed, falling back to TS agent', { error: String(error) });
        this.natAvailable = false;
      }
    }

    const response = await fetch('/api/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input }),
    });

    const data = await response.json();
    return { response: data.response, source: 'ts' };
  }
}

export const hybridClient = new HybridAgentClient();
