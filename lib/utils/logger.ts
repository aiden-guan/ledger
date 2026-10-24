/**
 * Minimal structured JSON logger. Never pass secrets, auth headers or raw
 * financial records into log fields; log identifiers, steps and durations.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = /token|secret|key|authorization|password|cookie/i;

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, REDACT_KEYS.test(k) ? "[redacted]" : v]),
  );
}

function threshold(): number {
  const level = (process.env.LOG_LEVEL as Level) || "info";
  return ORDER[level] ?? ORDER.info;
}

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < threshold()) return;
  if (process.env.VITEST && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/** Times an external call and logs provider/operation/durationMs/success. */
export async function timedExternalCall<T>(provider: string, operation: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info("external_call", { provider, operation, durationMs: Date.now() - start, success: true });
    return result;
  } catch (error) {
    logger.warn("external_call", {
      provider,
      operation,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Rejects after `ms` with a human-readable message. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
