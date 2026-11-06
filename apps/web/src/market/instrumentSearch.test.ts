import { describe, expect, it } from 'vitest';
import { mergeMarketSearchResults } from './instrumentSearch';
import type { WatchlistItem } from '../types/terminal';

function item(
  symbol: string,
  marketType: 'spot' | 'usdt_perpetual',
): WatchlistItem {
  return {
    symbolId: `binance:${marketType}:${symbol}`,
    symbol,
    marketType,
    lastPrice: 0,
    changePercent: 0,
  };
}

describe('mergeMarketSearchResults', () => {
  it('interleaves spot and perp for the same base like Binance', () => {
    const merged = mergeMarketSearchResults(
      [item('BTC/USDT', 'spot'), item('ETH/USDT', 'spot')],
      [item('BTC/USDT', 'usdt_perpetual'), item('SOL/USDT', 'usdt_perpetual')],
      6,
    );
    expect(merged.map((row) => row.symbolId)).toEqual([
      'binance:spot:BTC/USDT',
      'binance:usdt_perpetual:BTC/USDT',
      'binance:spot:ETH/USDT',
      'binance:usdt_perpetual:SOL/USDT',
    ]);
  });
});
