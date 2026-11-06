import { describe, expect, it } from 'vitest';
import {
  aggregateBookLevels,
  bookTickOptionsForPrice,
  defaultBookTick,
  formatBookPrice,
  formatTickLabel,
  tickDecimals,
} from './liveBook';

describe('book tick adaptation', () => {
  it('gives BTC a 0.01 finest tick instead of 1', () => {
    expect(bookTickOptionsForPrice(75_943)).toEqual([0.01, 0.1, 1, 10]);
    expect(defaultBookTick(75_943)).toBe(0.01);
  });

  it('uses micro ticks for meme-coin prices with full-length labels', () => {
    const options = bookTickOptionsForPrice(0.00000487);
    expect(options).toEqual([0.00000001, 0.0000001, 0.000001, 0.00001]);
    expect(options.map(formatTickLabel)).toEqual([
      '0.00000001',
      '0.0000001',
      '0.000001',
      '0.00001',
    ]);
  });

  it('keeps multiple buckets for PEPE-like books instead of collapsing to one row', () => {
    const tick = defaultBookTick(0.00000487);
    const levels = [
      { price: 0.00000487, qty: 1_000_000 },
      { price: 0.00000486, qty: 2_000_000 },
      { price: 0.00000485, qty: 3_000_000 },
      { price: 0.00000484, qty: 4_000_000 },
    ];
    const aggregated = aggregateBookLevels(levels, tick, 'bid', 7);
    expect(aggregated.length).toBeGreaterThan(1);
  });

  it('formats tiny ticks without scientific notation', () => {
    expect(tickDecimals(0.00000001)).toBe(8);
    expect(formatBookPrice(0.00000487, 0.00000001)).toContain('0.00000487');
    expect(formatTickLabel(0.00000001)).toBe('0.00000001');
  });
});
