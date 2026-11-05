import { describe, expect, it } from 'vitest';
import { parseKlineQuery } from './parse-kline-query';

describe('parseKlineQuery', () => {
  it('builds a kline request from the public query', () => {
    expect(
      parseKlineQuery({
        symbolId: 'binance:spot:BTC/USDT',
        interval: '15m',
        limit: '200',
        endTime: '1000',
      }),
    ).toEqual({
      symbol: {
        exchange: 'binance',
        marketType: 'spot',
        base: 'BTC',
        quote: 'USDT',
        rawSymbol: 'BTCUSDT',
        symbolId: 'binance:spot:BTC/USDT',
      },
      interval: '15m',
      limit: 200,
      endTime: 1000,
    });
  });

  it('rejects a symbol id the engine cannot store', () => {
    expect(() =>
      parseKlineQuery({
        symbolId: 'binance:usdt_perpetual:BTCUSDT',
        interval: '1m',
      }),
    ).toThrow(/pair/);
  });
});
