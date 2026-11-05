import type { Kline } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { RealtimeCoalescer, type FrameScheduler } from './coalesce';

function bar(openTime: number, close: number): Kline {
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
    closed: false,
    ts: openTime,
    receivedAt: close,
  };
}

function manualScheduler(): FrameScheduler & { flush(): void } {
  let pending: (() => void) | null = null;
  return {
    request(callback) {
      pending = callback;
      return 1;
    },
    cancel() {
      pending = null;
    },
    flush() {
      const callback = pending;
      pending = null;
      callback?.();
    },
  };
}

describe('RealtimeCoalescer', () => {
  it('keeps the latest tick for an open time and flushes once per frame', () => {
    const scheduler = manualScheduler();
    const batches: Kline[][] = [];
    const coalescer = new RealtimeCoalescer(scheduler, (klines) => {
      batches.push(klines);
    });

    coalescer.push(bar(0, 1));
    coalescer.push(bar(0, 2));
    coalescer.push(bar(60_000, 3));
    expect(batches).toHaveLength(0);

    scheduler.flush();
    expect(batches).toEqual([[bar(0, 2), bar(60_000, 3)]]);
  });
});
