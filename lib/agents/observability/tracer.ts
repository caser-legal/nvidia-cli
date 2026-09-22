import * as os from "os";
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

const HOME_DIR = process.env.HOME || os.homedir();
const TRACE_DIR = path.join(HOME_DIR, ".nvidia-cli", "traces");

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
  private traceId: string;

  constructor() {
    this.traceId = uuidv4();
    // Ensure trace directory exists on startup
    this.ensureTraceDir();
  }
  
  private async ensureTraceDir(): Promise<void> {
    try {
      await fs.mkdir(TRACE_DIR, { recursive: true });
    } catch {
      // Ignore - will retry on export
    }
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
    
    const index = this.activeSpans.indexOf(id);
    if (index > -1) {
      this.activeSpans.splice(index, 1);
    }
    
    // ALWAYS export - not optional
    this.exportSpan(span);
  }

  failSpan(id: string, error: Error): void {
    const span = this.spans.get(id);
    if (!span) return;

    span.endTime = Date.now();
    span.attributes.error = error.message;
    span.attributes.errorStack = error.stack;
    span.status = "error";

    const index = this.activeSpans.indexOf(id);
    if (index > -1) {
      this.activeSpans.splice(index, 1);
    }
    
    // ALWAYS export - not optional
    this.exportSpan(span);
  }

  private async exportSpan(span: Span): Promise<void> {
    const duration = span.endTime ? span.endTime - span.startTime : 0;
    const logEntry = {
      trace_id: this.traceId,
      span_id: span.id,
      parent_span_id: span.parentId,
      name: span.name,
      start_time: span.startTime,
      end_time: span.endTime,
      duration_ms: duration,
      status: span.status,
      attributes: span.attributes,
      timestamp: new Date().toISOString(),
    };
    
    // Persist to file - ALWAYS (not optional)
    try {
      await fs.mkdir(TRACE_DIR, { recursive: true });
      const filename = `${this.traceId}.jsonl`;
      await fs.appendFile(
        path.join(TRACE_DIR, filename),
        JSON.stringify(logEntry) + "\n"
      );
    } catch {
      // Silent failure for trace persistence - don't break main flow
    }
  }

  getTrace(): Span[] {
    return Array.from(this.spans.values());
  }
  
  getTraceId(): string {
    return this.traceId;
  }
  
  // Export all completed spans as OTLP-compatible JSON
  exportAll(): object[] {
    return Array.from(this.spans.values())
      .filter(s => s.status !== "running")
      .map(s => ({
        traceId: this.traceId,
        spanId: s.id,
        parentSpanId: s.parentId,
        name: s.name,
        startTimeUnixNano: s.startTime * 1_000_000,
        endTimeUnixNano: (s.endTime || s.startTime) * 1_000_000,
        status: { code: s.status === "ok" ? 1 : 2 },
        attributes: Object.entries(s.attributes).map(([k, v]) => ({ 
          key: k, 
          value: { stringValue: String(v) } 
        })),
      }));
  }
  
  // Get summary statistics
  getStats(): { totalSpans: number; completedSpans: number; errorSpans: number; avgDurationMs: number } {
    const spans = Array.from(this.spans.values());
    const completed = spans.filter(s => s.status !== "running");
    const errors = spans.filter(s => s.status === "error");
    
    let totalDuration = 0;
    for (const s of completed) {
      if (s.endTime) {
        totalDuration += s.endTime - s.startTime;
      }
    }
    
    return {
      totalSpans: spans.length,
      completedSpans: completed.length,
      errorSpans: errors.length,
      avgDurationMs: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
    };
  }
  
  // Reset for new trace
  reset(): void {
    this.spans.clear();
    this.activeSpans = [];
    this.traceId = uuidv4();
  }
}

export const globalTracer = new Tracer();
