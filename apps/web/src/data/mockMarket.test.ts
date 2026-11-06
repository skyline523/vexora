import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  formatQty,
  formatQtyWithScale,
  getInstrument,
  listedSymbol,
  listedTag,
  qtyScaleForMax,
  searchInstruments,
  watchlistItemFromSymbolId,
} from './mockMarket';

describe('searchInstruments', () => {
  it('matches symbol fragments within the selected market', () => {
    const results = searchInstruments('eth', { marketType: 'spot' });
    expect(results.some((item) => item.symbol === 'ETH/USDT')).toBe(true);
    expect(results.every((item) => item.marketType === 'spot')).toBe(true);
  });

  it('returns empty for unknown query', () => {
    expect(searchInstruments('zzzz-not-a-coin', { marketType: 'spot' })).toEqual([]);
  });
});

describe('watchlistItemFromSymbolId', () => {
  it('builds display items for any valid symbolId', () => {
    const item = watchlistItemFromSymbolId('binance:spot:PEPE/USDT');
    expect(item).toEqual({
      symbolId: 'binance:spot:PEPE/USDT',
      symbol: 'PEPE/USDT',
      marketType: 'spot',
      lastPrice: 0,
      changePercent: 0,
    });
    expect(getInstrument('binance:spot:PEPE/USDT')?.symbol).toBe('PEPE/USDT');
  });
});

describe('listedSymbol / listedTag', () => {
  it('matches Binance labels: spot pair with leverage, perpetual without a slash', () => {
    const spot = watchlistItemFromSymbolId('binance:spot:BTC/USDT')!;
    const perp = watchlistItemFromSymbolId('binance:usdt_perpetual:BTC/USDT')!;
    expect(listedSymbol(spot)).toBe('BTC/USDT');
    expect(listedTag(spot, { BTCUSDT: 10 })).toBe('10x');
    expect(listedSymbol(perp)).toBe('BTCUSDT');
    expect(listedTag(perp)).toBe('永续');
    expect(listedTag(spot)).toBeNull();
  });
});

describe('formatQty / formatPrice', () => {
  it('keeps BTC-scale sizes plain without K/M', () => {
    const scale = qtyScaleForMax(12.5);
    expect(scale.suffix).toBe('');
    expect(formatQtyWithScale(0.521, scale)).toBe('0.521');
    expect(formatQtyWithScale(12.5, scale)).toBe('12.500');
  });

  it('compacts meme-coin books using one shared scale', () => {
    const scale = qtyScaleForMax(50_000_000);
    expect(scale.suffix).toBe('M');
    expect(formatQtyWithScale(12_450_000, scale)).toBe('12.45M');
    expect(formatQtyWithScale(850_000, scale)).toBe('0.85M');
    expect(formatQty(1_250_000_000)).toBe('1.25B');
  });

  it('uses exchange-style subscripts for tiny prices', () => {
    expect(formatPrice(0.00000487)).toBe('0.0₅487');
  });
});
