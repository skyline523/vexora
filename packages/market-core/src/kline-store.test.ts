import { createMarketSymbol, type Kline } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { mergeKlineLists, preferIncomingKline } from './kline-merge';
import { KlineStore } from './kline-store';

const spot = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

const perp = createMarketSymbol({
  exchange: 'binance',
  marketType: 'usdt_perpetual',
  base: 'BTC',
  quote: 'USDT',
});

function bar(openTime: number, patch: Partial<Kline> = {}): Kline {
  const closeTime = patch.closeTime ?? openTime + 59_999;
  return {
    symbolId: spot.symbolId,
    interval: '1m',
    openTime,
    closeTime,
    open: 1,
    high: 2,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
    ts: closeTime,
    receivedAt: 1,
    ...patch,
  };
}

describe('kline merge', () => {
  it('sorts out-of-order candles and dedupes the same openTime', () => {
    const store = new KlineStore();
    store.upsert(bar(120_000, { close: 3 }));
    store.upsert(bar(0, { close: 1 }));
    store.upsert(bar(60_000, { close: 2 }));
    store.upsert(bar(60_000, { close: 2, receivedAt: 2 }));

    expect(store.query(spot.symbolId, '1m').map((kline) => kline.openTime)).toEqual([
      0, 60_000, 120_000,
    ]);
    expect(store.query(spot.symbolId, '1m')).toHaveLength(3);
  });

  it('keeps a closed candle ahead of a late in-progress update', () => {
    const store = new KlineStore();
    store.upsert(bar(0, { close: 10, closed: true, ts: 50_000, receivedAt: 1 }));
    const applied = store.upsert(bar(0, { close: 4, closed: false, ts: 80_000, receivedAt: 2 }));

    expect(applied).toBe(false);
    expect(store.getLast(spot.symbolId, '1m', 1)[0]).toMatchObject({ close: 10, closed: true });
  });

  it('lets a websocket tick replace a REST snapshot of the open candle', () => {
    const openTime = 0;
    const closeTime = 59_999;
    const existing = bar(openTime, {
      close: 100,
      closed: false,
      closeTime,
      ts: closeTime,
      receivedAt: 1,
    });
    const incoming = bar(openTime, {
      close: 110,
      closed: false,
      closeTime,
      ts: 10_000,
      receivedAt: 2,
    });

    expect(preferIncomingKline(existing, incoming)).toBe(true);
  });

  it('drops an older websocket tick that arrives late', () => {
    const newer = bar(0, { close: 5, closed: false, ts: 2_000, receivedAt: 1 });
    const older = bar(0, { close: 1, closed: false, ts: 1_000, receivedAt: 2 });
    expect(preferIncomingKline(newer, older)).toBe(false);
  });

  it('does not merge spot and perpetual candles', () => {
    const perpBar = bar(0, { symbolId: perp.symbolId });
    expect(() => mergeKlineLists([[bar(0)], [perpBar]])).toThrow(/different series/);
  });

  it('keeps spot and perpetual series apart and caps length', () => {
    const store = new KlineStore(3);
    store.upsert(bar(0, { close: 1 }));
    store.upsert(bar(0, { symbolId: perp.symbolId, close: 9 }));
    for (const openTime of [60_000, 120_000, 180_000, 240_000]) {
      store.upsert(bar(openTime));
    }

    expect(store.query(spot.symbolId, '1m').map((kline) => kline.openTime)).toEqual([
      120_000, 180_000, 240_000,
    ]);
    expect(store.query(perp.symbolId, '1m')).toEqual([
      expect.objectContaining({ symbolId: perp.symbolId, close: 9 }),
    ]);
  });

  it('detects a missing candle between neighbors', () => {
    const store = new KlineStore();
    store.upsert(bar(0));
    store.upsert(bar(120_000));

    expect(store.detectGaps(spot.symbolId, '1m')).toEqual([
      {
        symbolId: spot.symbolId,
        interval: '1m',
        fromOpenTime: 60_000,
        toOpenTime: 120_000,
      },
    ]);
  });
});
