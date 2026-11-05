import type { KlineInterval } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const KLINE_INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': MINUTE,
  '3m': 3 * MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '2h': 2 * HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '1w': 7 * DAY,
};

export function intervalToMs(interval: KlineInterval): number {
  return KLINE_INTERVAL_MS[interval];
}
