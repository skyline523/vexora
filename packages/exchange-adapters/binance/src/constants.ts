import type { MarketType } from '@vexora/shared';

export const BINANCE_EXCHANGE_ID = 'binance' as const;

/**
 * Spot defaults to Binance market-data hosts (`*.binance.vision`).
 * These are official public market endpoints and are often reachable when
 * `api.binance.com` / `stream.binance.com` return 451 or are blocked.
 */
export const BINANCE_REST_BASE: Record<MarketType, string> = {
  spot: 'https://data-api.binance.vision',
  usdt_perpetual: 'https://fapi.binance.com',
};

export const BINANCE_WS_BASE: Record<MarketType, string> = {
  spot: 'wss://data-stream.binance.vision',
  usdt_perpetual: 'wss://fstream.binance.com',
};

/** Default REST request weight budget soft ceiling (1m window). */
export const DEFAULT_WEIGHT_SOFT_LIMIT = 1000;

/** Hard stop before Binance IP ban thresholds. */
export const DEFAULT_WEIGHT_HARD_LIMIT = 1100;

export const DEFAULT_REST_TIMEOUT_MS = 15_000;

export const WS_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

/** Control-message throttle: Binance allows ~5 inbound msgs/sec. */
export const WS_CONTROL_MIN_INTERVAL_MS = 250;
