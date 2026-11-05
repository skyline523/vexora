import { intervalToMs, type GapInfo, type Kline, type KlineInterval } from '@vexora/shared';

/**
 * Gaps are half-open: missing candles have `fromOpenTime <= openTime < toOpenTime`.
 * `toOpenTime` is the next candle that already exists (or the current forming open).
 */
export function detectKlineGaps(
  klines: readonly Kline[],
  interval: KlineInterval,
  symbolId: string,
): GapInfo[] {
  const intervalMs = intervalToMs(interval);
  const gaps: GapInfo[] = [];
  for (let index = 1; index < klines.length; index += 1) {
    const previous = klines[index - 1];
    const next = klines[index];
    if (!previous || !next) continue;
    if (next.openTime - previous.openTime > intervalMs) {
      gaps.push({
        symbolId,
        interval,
        fromOpenTime: previous.openTime + intervalMs,
        toOpenTime: next.openTime,
      });
    }
  }
  return gaps;
}

/** Missing closed candles after `last`, excluding the candle that contains `now`. */
export function gapSince(last: Kline, now: number): GapInfo | null {
  const intervalMs = intervalToMs(last.interval);
  const fromOpenTime = last.openTime + intervalMs;
  if (now < fromOpenTime + intervalMs) return null;
  const steps = Math.floor((now - fromOpenTime) / intervalMs);
  const currentOpen = fromOpenTime + steps * intervalMs;
  if (currentOpen <= fromOpenTime) return null;
  return {
    symbolId: last.symbolId,
    interval: last.interval,
    fromOpenTime,
    toOpenTime: currentOpen,
  };
}
