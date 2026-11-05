import { describe, expect, it } from 'vitest';
import { klineQuery } from './market';

describe('klineQuery', () => {
  it('encodes the history request used by the chart', () => {
    expect(
      klineQuery({
        symbolId: 'binance:spot:BTC/USDT',
        interval: '15m',
        limit: 500,
        endTime: 1_700_000_000_000,
      }),
    ).toBe('symbolId=binance%3Aspot%3ABTC%2FUSDT&interval=15m&limit=500&endTime=1700000000000');
  });
});
