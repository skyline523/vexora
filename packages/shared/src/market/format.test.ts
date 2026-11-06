import { describe, expect, it } from 'vitest';
import { formatMarketPrice, inferPriceDecimals, inferPriceMinMove } from './format';

describe('formatMarketPrice', () => {
  it('formats large and mid prices normally', () => {
    expect(formatMarketPrice(75943)).toMatch(/75,943/);
    expect(formatMarketPrice(1.2345)).toContain('1.23');
    expect(formatMarketPrice(0.6421)).toContain('0.642');
  });

  it('uses Binance-style subscripts for meme-coin prices', () => {
    expect(formatMarketPrice(0.00000487)).toBe('0.0₅487');
    expect(formatMarketPrice(0.00001234)).toBe('0.0₄1234');
  });

  it('can disable subscripts for plain high-precision text', () => {
    expect(formatMarketPrice(0.00000487, { subscriptZeros: false })).toContain('0.00000487');
  });
});

describe('inferPriceDecimals', () => {
  it('gives enough decimals for chart axes on tiny prices', () => {
    expect(inferPriceDecimals(0.00000487)).toBeGreaterThanOrEqual(8);
    expect(inferPriceMinMove(0.00000487)).toBeLessThanOrEqual(1e-8);
  });
});
