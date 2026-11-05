import { describe, expect, it, vi } from 'vitest';
import { WeightRateLimiter } from './rate-limiter';

describe('WeightRateLimiter', () => {
  it('tracks header used-weight', () => {
    const limiter = new WeightRateLimiter({ now: () => 1_000 });
    limiter.updateFromHeader('42');
    expect(limiter.getUsedWeight()).toBe(42);
  });

  it('waits when approaching hard limit', async () => {
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = new WeightRateLimiter({
      softLimit: 10,
      hardLimit: 12,
      now: () => now,
      sleep,
    });

    // 5 < softLimit → no wait
    await limiter.schedule(5);
    expect(sleep).not.toHaveBeenCalled();

    // 5 + 6 >= softLimit → soft wait (200ms)
    await limiter.schedule(6);
    expect(sleep).toHaveBeenCalledWith(200);
    sleep.mockClear();

    // usedWeight is 11; next weight 2 crosses hardLimit → long wait
    await limiter.schedule(2);
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(50);
  });
});
