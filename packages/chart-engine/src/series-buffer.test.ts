import type { Kline } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { KlineSeriesBuffer } from './series-buffer';

function bar(openTime: number, close: number, patch: Partial<Kline> = {}): Kline {
  return {
    symbolId: 'binance:spot:BTC/USDT',
    interval: '1m',
    openTime,
    closeTime: openTime + 59_999,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
    ts: openTime,
    receivedAt: openTime,
    ...patch,
  };
}

describe('KlineSeriesBuffer', () => {
  it('sorts history and updates the same open time in place', () => {
    const buffer = new KlineSeriesBuffer();
    buffer.reset([bar(120_000, 3), bar(0, 1), bar(60_000, 2)]);
    expect(buffer.upsert(bar(60_000, 9, { receivedAt: 60_001 }))).toBe('update');

    expect(buffer.getAll().map((kline) => [kline.openTime, kline.close])).toEqual([
      [0, 1],
      [60_000, 9],
      [120_000, 3],
    ]);
  });

  it('appends a newer candle and inserts an older one without duplicating', () => {
    const buffer = new KlineSeriesBuffer();
    buffer.reset([bar(0, 1), bar(120_000, 3)]);
    expect(buffer.upsert(bar(180_000, 4))).toBe('append');
    expect(buffer.upsert(bar(60_000, 2))).toBe('insert');
    expect(buffer.getAll().map((kline) => kline.openTime)).toEqual([0, 60_000, 120_000, 180_000]);
  });

  it('counts only new bars prepended ahead of the current window', () => {
    const buffer = new KlineSeriesBuffer();
    buffer.reset([bar(120_000, 3), bar(180_000, 4)]);
    const added = buffer.prepend([bar(0, 1), bar(60_000, 2), bar(120_000, 8, { receivedAt: 1 })]);
    expect(added).toBe(2);
    expect(buffer.getAll()[2]?.close).toBe(3);
  });

  it('does not let an in-progress tick reopen a closed candle', () => {
    const buffer = new KlineSeriesBuffer();
    buffer.reset([bar(0, 10, { closed: true, receivedAt: 1 })]);
    buffer.upsert(bar(0, 4, { closed: false, receivedAt: 2 }));
    expect(buffer.last()).toMatchObject({ close: 10, closed: true });
  });
});
