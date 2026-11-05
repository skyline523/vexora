import type { KlineInterval } from '@vexora/shared';

/** `kline:{symbolId}:{interval}` — symbolId itself contains colons. */
export function klineSubscriptionKey(symbolId: string, interval: KlineInterval): string {
  return `kline:${symbolId}:${interval}`;
}

export function tradeSubscriptionKey(symbolId: string): string {
  return `trade:${symbolId}`;
}

export function tickerSubscriptionKey(symbolId: string): string {
  return `ticker:${symbolId}`;
}

export function orderbookSubscriptionKey(symbolId: string): string {
  return `orderbook:${symbolId}`;
}
