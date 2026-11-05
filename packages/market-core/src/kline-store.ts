import { intervalToMs, type GapInfo, type Kline, type KlineInterval } from '@vexora/shared';
import { detectKlineGaps } from './gap';
import { preferIncomingKline, selectKlines, type KlineQuery } from './kline-merge';

export function klineSeriesKey(symbolId: string, interval: KlineInterval): string {
  return `${symbolId}|${interval}`;
}

function lowerBound(series: readonly Kline[], openTime: number): number {
  let lo = 0;
  let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const open = series[mid]?.openTime;
    if (open == null || open < openTime) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class KlineStore {
  private readonly series = new Map<string, Kline[]>();

  constructor(private readonly maxBars = 2000) {
    if (maxBars < 1) {
      throw new Error('maxBars must be at least 1');
    }
  }

  upsert(incoming: Kline): boolean {
    const key = klineSeriesKey(incoming.symbolId, incoming.interval);
    const series = this.series.get(key) ?? [];
    const index = lowerBound(series, incoming.openTime);
    const current = series[index];

    if (current && current.openTime === incoming.openTime) {
      if (!preferIncomingKline(current, incoming)) return false;
      series[index] = { ...incoming };
      this.series.set(key, series);
      return true;
    }

    const oldest = series[0];
    if (series.length >= this.maxBars && oldest && incoming.openTime < oldest.openTime) {
      return false;
    }

    series.splice(index, 0, { ...incoming });
    if (series.length > this.maxBars) {
      series.splice(0, series.length - this.maxBars);
    }
    this.series.set(key, series);
    return true;
  }

  upsertMany(klines: readonly Kline[]): Kline[] {
    const applied: Kline[] = [];
    const ordered = [...klines].sort((left, right) => left.openTime - right.openTime);
    for (const kline of ordered) {
      if (this.upsert(kline)) applied.push({ ...kline });
    }
    return applied;
  }

  query(symbolId: string, interval: KlineInterval, query: KlineQuery = {}): Kline[] {
    const series = this.series.get(klineSeriesKey(symbolId, interval)) ?? [];
    return selectKlines(series, query);
  }

  getLast(symbolId: string, interval: KlineInterval, count: number): Kline[] {
    if (count < 1) return [];
    const series = this.series.get(klineSeriesKey(symbolId, interval)) ?? [];
    return series.slice(Math.max(0, series.length - count)).map((kline) => ({ ...kline }));
  }

  detectGaps(symbolId: string, interval: KlineInterval): GapInfo[] {
    const series = this.series.get(klineSeriesKey(symbolId, interval)) ?? [];
    return detectKlineGaps(series, interval, symbolId);
  }

  gapsAround(kline: Kline): GapInfo[] {
    const intervalMs = intervalToMs(kline.interval);
    return this.detectGaps(kline.symbolId, kline.interval).filter((gap) => {
      return gap.toOpenTime === kline.openTime || gap.fromOpenTime === kline.openTime + intervalMs;
    });
  }
}
