import { describe, expect, it } from 'vitest';
import { parseTickersQuery } from './parse-tickers-query';

describe('parseTickersQuery', () => {
  it('parses a comma-separated symbolId list', () => {
    const symbols = parseTickersQuery({
      symbolIds: 'binance:spot:BTC/USDT, binance:spot:ETH/USDT',
    });
    expect(symbols.map((s) => s.symbolId)).toEqual([
      'binance:spot:BTC/USDT',
      'binance:spot:ETH/USDT',
    ]);
  });

  it('rejects empty input', () => {
    expect(() => parseTickersQuery({})).toThrow(/symbolIds/);
  });
});
