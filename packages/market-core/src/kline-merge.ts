import type { Kline, KlineInterval } from '@vexora/shared';

/**
 * REST klines use `ts === closeTime`, which is the candle boundary, not an event time.
 * WebSocket klines use the exchange event time, which is earlier than `closeTime`
 * while the candle is still open. Compare those clocks separately.
 */
export function klineEventTime(kline: Kline): number | null {
  if (kline.ts === kline.closeTime) return null;
  return kline.ts;
}

function sameBar(existing: Kline, incoming: Kline): boolean {
  return (
    existing.open === incoming.open &&
    existing.high === incoming.high &&
    existing.low === incoming.low &&
    existing.close === incoming.close &&
    existing.volume === incoming.volume &&
    existing.quoteVolume === incoming.quoteVolume &&
    existing.tradeCount === incoming.tradeCount &&
    existing.closeTime === incoming.closeTime &&
    existing.closed === incoming.closed
  );
}

/** Return true when `incoming` should replace `existing` for the same openTime. */
export function preferIncomingKline(existing: Kline, incoming: Kline): boolean {
  if (existing.openTime !== incoming.openTime) return false;
  if (sameBar(existing, incoming)) return false;
  if (existing.closed && !incoming.closed) return false;
  if (!existing.closed && incoming.closed) return true;

  const existingEvent = klineEventTime(existing);
  const incomingEvent = klineEventTime(incoming);
  if (existingEvent != null && incomingEvent != null) {
    if (incomingEvent !== existingEvent) return incomingEvent > existingEvent;
    return incoming.receivedAt >= existing.receivedAt;
  }
  if (incomingEvent != null && existingEvent == null) {
    return !existing.closed || incoming.receivedAt >= existing.receivedAt;
  }
  if (incomingEvent == null && existingEvent != null) {
    return incoming.closed;
  }
  return incoming.receivedAt >= existing.receivedAt;
}

export function mergeKlineLists(groups: readonly (readonly Kline[])[]): Kline[] {
  const byOpen = new Map<number, Kline>();
  let symbolId: string | undefined;
  let interval: KlineInterval | undefined;

  for (const group of groups) {
    for (const kline of group) {
      if (symbolId == null) {
        symbolId = kline.symbolId;
        interval = kline.interval;
      } else if (kline.symbolId !== symbolId || kline.interval !== interval) {
        throw new Error(
          `Cannot merge klines from different series: ${symbolId}/${interval} vs ${kline.symbolId}/${kline.interval}`,
        );
      }

      const previous = byOpen.get(kline.openTime);
      if (!previous || preferIncomingKline(previous, kline)) {
        byOpen.set(kline.openTime, { ...kline });
      }
    }
  }

  return [...byOpen.values()].sort((left, right) => left.openTime - right.openTime);
}

export interface KlineQuery {
  startTime?: number;
  /** Exclusive openTime. Pass the earliest loaded candle to page backward. */
  endTime?: number;
  limit?: number;
}

export function selectKlines(klines: readonly Kline[], query: KlineQuery = {}): Kline[] {
  const sorted = [...klines].sort((left, right) => left.openTime - right.openTime);
  const filtered = sorted.filter((kline) => {
    if (query.startTime != null && kline.openTime < query.startTime) return false;
    if (query.endTime != null && kline.openTime >= query.endTime) return false;
    return true;
  });
  const limited =
    query.limit != null && filtered.length > query.limit
      ? filtered.slice(filtered.length - query.limit)
      : filtered;
  return limited.map((kline) => ({ ...kline }));
}
