// Tracing - Request ID correlation for observability

export interface TraceContext {
  requestId: string;
  spanId?: string;
}

export function createTraceContext(): TraceContext {
  return { requestId: crypto.randomUUID() };
}

export function log(msg: string, ctx?: TraceContext, level: "info" | "warn" | "error" = "info"): void {
  const prefix = `[${ctx?.requestId ?? "no-id"}]`;
  switch (level) {
    case "info": console.info(`${prefix} ${msg}`); break;
    case "warn": console.warn(`${prefix} ${msg}`); break;
    case "error": console.error(`${prefix} ${msg}`); break;
  }
}
