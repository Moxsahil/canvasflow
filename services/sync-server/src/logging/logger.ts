import type { Env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured JSON logger for sync-server.
 *
 * Every log line is a single-line JSON object with:
 *   - ts:      ISO timestamp
 *   - level:   debug | info | warn | error
 *   - msg:     the human-readable message
 *   - ...meta: arbitrary structured context (userId, boardId, requestId, etc.)
 *
 * Format is designed for log aggregation (Datadog, Loki, CloudWatch)
 * and for local grep/jq inspection.
 */
export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  child: (context: Record<string, unknown>) => Logger;
}

export function createLogger(env: Env, baseContext: Record<string, unknown> = {}): Logger {
  const threshold = LEVEL_PRIORITY[env.LOG_LEVEL];

  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_PRIORITY[level] < threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...baseContext,
      ...meta,
    });
    // Written to the streams directly rather than through console: these are
    // structured JSON lines, and log collectors read stderr separately from
    // stdout. Behaviourally identical to console.error/warn/log.
    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    child: (context) => createLogger(env, { ...baseContext, ...context }),
  };
}
