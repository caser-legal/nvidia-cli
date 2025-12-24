
import { v4 as uuidv4 } from 'uuid';

export interface Span {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error" | "running";
}

export class Tracer {
  private spans: Map<string, Span> = new Map();
  private activeSpans: string[] = [];
  private static readonly MAX_SPANS = 1000;
  private exportEnabled: boolean;

  constructor(exportEnabled: boolean = process.env.TRACE_EXPORT === "true") {
    this.exportEnabled = exportEnabled;
  }

  startSpan(name: string, attributes: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const parentId = this.activeSpans.length > 0 ? this.activeSpans[this.activeSpans.length - 1] : undefined;
    
    const span: Span = {
      id,
      parentId,
      name,
      startTime: Date.now(),
      attributes,
      status: "running"
    };
    
    // Evict oldest completed spans if at capacity
    if (this.spans.size >= Tracer.MAX_SPANS) {
      for (const [key, s] of this.spans) {
        if (s.status !== "running") { this.spans.delete(key); break; }
      }
    }
    
    this.spans.set(id, span);
    this.activeSpans.push(id);
    return id;
  }

  endSpan(id: string, attributes: Record<string, unknown> = {}): void {
    const span = this.spans.get(id);
    if (!span) return;

    span.endTime = Date.now();
    span.attributes = { ...span.attributes, ...attributes };
    span.status = "ok";
    
    // Remove from active stack
    const index = this.activeSpans.indexOf(id);
    if (index > -1) {
      this.activeSpans.splice(index, 1);
    }
    
    this.exportSpan(span);
  }

  failSpan(id: string, error: Error): void {
    const span = this.spans.get(id);
    if (!span) return;

    span.endTime = Date.now();
    span.attributes.error = error.message;
    span.status = "error";

    const index = this.activeSpans.indexOf(id);
    if (index > -1) {
      this.activeSpans.splice(index, 1);
    }
    
    this.exportSpan(span);
  }

  private exportSpan(span: Span): void {
    if (!this.exportEnabled) return;
    
    const duration = span.endTime ? span.endTime - span.startTime : 0;
    const logEntry = {
      trace_id: span.parentId || span.id,
      span_id: span.id,
      name: span.name,
      duration_ms: duration,
      status: span.status,
      ...span.attributes,
    };
    
    // Export to stderr (stdout reserved for MCP stdio transport)
    console.error(`[TRACE] ${JSON.stringify(logEntry)}`);
  }

  getTrace(): Span[] {
    return Array.from(this.spans.values());
  }
  
  // Export all completed spans as OTLP-compatible JSON
  exportAll(): object[] {
    return Array.from(this.spans.values())
      .filter(s => s.status !== "running")
      .map(s => ({
        traceId: s.parentId || s.id,
        spanId: s.id,
        parentSpanId: s.parentId,
        name: s.name,
        startTimeUnixNano: s.startTime * 1_000_000,
        endTimeUnixNano: (s.endTime || s.startTime) * 1_000_000,
        status: { code: s.status === "ok" ? 1 : 2 },
        attributes: Object.entries(s.attributes).map(([k, v]) => ({ key: k, value: { stringValue: String(v) } })),
      }));
  }
}

export const globalTracer = new Tracer();
