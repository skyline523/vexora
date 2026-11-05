import { describe, expect, it } from 'vitest';
import { KLINE_INTERVALS } from './types';
import { intervalToMs, KLINE_INTERVAL_MS } from './interval';

describe('kline intervals', () => {
  it('defines a positive duration for every interval', () => {
    for (const interval of KLINE_INTERVALS) {
      expect(intervalToMs(interval)).toBe(KLINE_INTERVAL_MS[interval]);
      expect(intervalToMs(interval)).toBeGreaterThan(0);
    }
  });

  it('keeps 1m and 1h aligned to exchange candle size', () => {
    expect(intervalToMs('1m')).toBe(60_000);
    expect(intervalToMs('1h')).toBe(3_600_000);
    expect(intervalToMs('1w')).toBe(604_800_000);
  });
});
