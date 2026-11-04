import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('redacts sensitive fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger('test', { level: 'info' });

    logger.info('hello', { apiKey: 'secret-value', nested: { token: 'abc' } });

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      meta: { apiKey: string; nested: { token: string } };
    };
    expect(payload.meta.apiKey).toBe('[REDACTED]');
    expect(payload.meta.nested.token).toBe('[REDACTED]');
    spy.mockRestore();
  });

  it('respects log level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger('test', { level: 'warn' });

    logger.info('should not appear');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
