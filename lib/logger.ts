/**
 * Structured Logger
 * Wraps console with levels and optional JSON output
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";
const JSON_OUTPUT = process.env.LOG_JSON === "true";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatMessage(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): string {
  if (JSON_OUTPUT) {
    return JSON.stringify({ ts: new Date().toISOString(), level, component, message, ...data });
  }
  const prefix = `[${component}]`;
  return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
}

export function createLogger(component: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog("debug")) console.debug(formatMessage("debug", component, message, data));
    },
    info: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog("info")) console.log(formatMessage("info", component, message, data));
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog("warn")) console.warn(formatMessage("warn", component, message, data));
    },
    error: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog("error")) console.error(formatMessage("error", component, message, data));
    },
  };
}

export const log = createLogger("app");
