import { describe, expect, it } from 'vitest';
import { buildSymbolId, createMarketSymbol, parseSymbolId } from './symbols';

describe('market symbols', () => {
  it('builds stable symbolId', () => {
    expect(buildSymbolId('binance', 'spot', 'btc', 'usdt')).toBe(
      'binance:spot:BTC/USDT',
    );
  });

  it('creates MarketSymbol with raw fallback', () => {
    const symbol = createMarketSymbol({
      exchange: 'binance',
      marketType: 'usdt_perpetual',
      base: 'eth',
      quote: 'usdt',
    });
    expect(symbol).toEqual({
      exchange: 'binance',
      marketType: 'usdt_perpetual',
      base: 'ETH',
      quote: 'USDT',
      rawSymbol: 'ETHUSDT',
      symbolId: 'binance:usdt_perpetual:ETH/USDT',
    });
  });

  it('parses symbolId', () => {
    expect(parseSymbolId('binance:spot:BTC/USDT')).toEqual({
      exchange: 'binance',
      marketType: 'spot',
      base: 'BTC',
      quote: 'USDT',
    });
  });

  it('rejects invalid symbolId', () => {
    expect(() => parseSymbolId('binance:spot:BTCUSDT')).toThrow(/pair/);
  });
});
