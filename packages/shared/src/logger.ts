export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

function shouldLog(minLevel: LogLevel, level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function redact(value: unknown): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(input)) {
    if (/api[_-]?key|secret|authorization|token|password/i.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = redact(nested);
  }

  return output;
}

function write(
  level: LogLevel,
  scope: string,
  bindings: Record<string, unknown>,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const payload = {
    level,
    time: new Date().toISOString(),
    scope,
    msg: message,
    ...(Object.keys(bindings).length > 0 ? { bindings: redact(bindings) } : {}),
    ...(meta ? { meta: redact(meta) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createLogger(
  scope: string,
  options?: { level?: LogLevel; bindings?: Record<string, unknown> },
): Logger {
  const minLevel = options?.level ?? 'info';
  const bindings = options?.bindings ?? {};

  const log =
    (level: LogLevel) =>
    (message: string, meta?: Record<string, unknown>): void => {
      if (!shouldLog(minLevel, level)) {
        return;
      }
      write(level, scope, bindings, message, meta);
    };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child(childBindings: Record<string, unknown>): Logger {
      return createLogger(scope, {
        level: minLevel,
        bindings: { ...bindings, ...childBindings },
      });
    },
  };
}
