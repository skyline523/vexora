import type { Kline } from '@vexora/shared';

export type CandleApply = 'append' | 'update' | 'insert';

function preferIncoming(existing: Kline, incoming: Kline): boolean {
  if (existing.openTime !== incoming.openTime) return false;
  if (existing.closed && !incoming.closed) return false;
  if (!existing.closed && incoming.closed) return true;
  return incoming.receivedAt >= existing.receivedAt;
}

function mergeKlines(current: readonly Kline[], incoming: readonly Kline[]): Kline[] {
  const byOpen = new Map<number, Kline>();
  for (const kline of current) {
    byOpen.set(kline.openTime, kline);
  }
  for (const kline of incoming) {
    const previous = byOpen.get(kline.openTime);
    if (!previous || preferIncoming(previous, kline)) {
      byOpen.set(kline.openTime, kline);
    }
  }
  return [...byOpen.values()].sort((left, right) => left.openTime - right.openTime);
}

function lowerBound(series: readonly Kline[], openTime: number): number {
  let lo = 0;
  let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const open = series[mid]?.openTime ?? 0;
    if (open < openTime) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Ordered candle window used by the chart. Same openTime updates one candle. */
export class KlineSeriesBuffer {
  private candles: Kline[] = [];

  reset(klines: readonly Kline[]): void {
    this.candles = mergeKlines([], klines);
  }

  getAll(): Kline[] {
    return this.candles.map((kline) => ({ ...kline }));
  }

  last(): Kline | undefined {
    const kline = this.candles[this.candles.length - 1];
    return kline ? { ...kline } : undefined;
  }

  /**
   * Merge older pages into the window.
   * Returns how many new bars were inserted before the previous first bar.
   */
  prepend(klines: readonly Kline[]): number {
    const first = this.candles[0]?.openTime ?? Number.POSITIVE_INFINITY;
    const existing = new Set(this.candles.map((kline) => kline.openTime));
    let addedBefore = 0;
    for (const kline of klines) {
      if (!existing.has(kline.openTime) && kline.openTime < first) {
        addedBefore += 1;
      }
    }
    this.candles = mergeKlines(this.candles, klines);
    return addedBefore;
  }

  upsert(kline: Kline): CandleApply {
    const last = this.candles[this.candles.length - 1];
    if (!last || kline.openTime > last.openTime) {
      this.candles.push(kline);
      return 'append';
    }
    if (kline.openTime === last.openTime) {
      if (preferIncoming(last, kline)) {
        this.candles[this.candles.length - 1] = kline;
      }
      return 'update';
    }

    const index = lowerBound(this.candles, kline.openTime);
    const current = this.candles[index];
    if (current && current.openTime === kline.openTime) {
      if (preferIncoming(current, kline)) {
        this.candles[index] = kline;
      }
      return 'update';
    }
    this.candles.splice(index, 0, kline);
    return 'insert';
  }
}
