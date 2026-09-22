// Retry Mixin - NAT-style retry wrapper for all async calls

export interface RetryOptions {
  doAutoRetry?: boolean;
  numRetries?: number;
  retryOnStatusCodes?: string[];
  retryOnErrors?: string[];
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): () => Promise<T> {
  const {
    doAutoRetry = true,
    numRetries = 3,
    retryOnStatusCodes = [],
    retryOnErrors = [],
    baseDelayMs = 200,
    maxDelayMs = 2000,
  } = opts;

  return async function wrapped(): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.statusCode ?? err?.error?.status;
        const message = err?.message ?? err?.error?.message ?? "";

        const statusMatch = retryOnStatusCodes.some((code) => String(status).startsWith(code));
        const errorMatch = retryOnErrors.some((sub) => message.toLowerCase().includes(sub.toLowerCase()));

        if (!doAutoRetry || (!statusMatch && !errorMatch) || attempt >= numRetries - 1) throw err;

        const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const jitter = delay * Math.random() * 0.3;
        await new Promise((r) => setTimeout(r, delay + jitter));
        attempt++;
      }
    }
  };
}
