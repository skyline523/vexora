import { createMarketSymbol, type Kline } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { detectKlineGaps, gapSince } from './gap';

const symbol = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

function bar(openTime: number): Kline {
  return {
    symbolId: symbol.symbolId,
    interval: '1m',
    openTime,
    closeTime: openTime + 59_999,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
    ts: openTime + 59_999,
    receivedAt: 1,
  };
}

describe('gap detection', () => {
  it('returns no gaps for a contiguous series', () => {
    expect(detectKlineGaps([bar(0), bar(60_000)], '1m', symbol.symbolId)).toEqual([]);
  });

  it('fills only candles that have fully closed since the last bar', () => {
    const last = bar(0);
    expect(gapSince(last, 100_000)).toBeNull();
    expect(gapSince(last, 180_000)).toEqual({
      symbolId: symbol.symbolId,
      interval: '1m',
      fromOpenTime: 60_000,
      toOpenTime: 180_000,
    });
  });
});
