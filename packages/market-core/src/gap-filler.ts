import {
  intervalToMs,
  type GapInfo,
  type GetKlinesParams,
  type Kline,
  type MarketSymbol,
} from '@vexora/shared';

export class GapFiller {
  constructor(
    private readonly getKlines: (params: GetKlinesParams) => Promise<Kline[]>,
    private readonly maxBars = 5000,
  ) {}

  async pull(symbol: MarketSymbol, gap: GapInfo): Promise<Kline[]> {
    if (gap.fromOpenTime >= gap.toOpenTime || this.maxBars < 1) return [];

    const intervalMs = intervalToMs(gap.interval);
    const collected: Kline[] = [];
    const seen = new Set<number>();
    let cursor = gap.fromOpenTime;

    while (cursor < gap.toOpenTime && collected.length < this.maxBars) {
      // Adapters return candles ascending from startTime, capped by limit.
      const batch = await this.getKlines({
        symbol,
        interval: gap.interval,
        startTime: cursor,
        endTime: gap.toOpenTime - 1,
        limit: Math.min(1000, this.maxBars - collected.length),
      });
      const fresh = batch
        .filter(
          (kline) =>
            kline.openTime >= cursor &&
            kline.openTime < gap.toOpenTime &&
            !seen.has(kline.openTime),
        )
        .sort((left, right) => left.openTime - right.openTime);
      if (fresh.length === 0) break;

      for (const kline of fresh) {
        seen.add(kline.openTime);
        collected.push(kline);
        if (collected.length >= this.maxBars) break;
      }

      const last = fresh[fresh.length - 1];
      if (!last) break;
      const next = last.openTime + intervalMs;
      if (next <= cursor) break;
      cursor = next;
    }

    return collected;
  }
}
