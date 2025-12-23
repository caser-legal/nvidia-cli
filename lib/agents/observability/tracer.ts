
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
  }

  getTrace(): Span[] {
    return Array.from(this.spans.values());
  }
}

export const globalTracer = new Tracer();
