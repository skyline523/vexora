import { describe, expect, it } from 'vitest';
import {
  exponentialMovingAverage,
  movingAverageConvergenceDivergence,
  relativeStrengthIndex,
  simpleMovingAverage,
} from './indicators';

describe('indicators', () => {
  it('computes a simple moving average after the period is filled', () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('seeds EMA with the first SMA and then applies the smoothing weight', () => {
    const ema = exponentialMovingAverage([1, 2, 3, 4, 5], 3);
    expect(ema[2]).toBe(2);
    expect(ema[3]).toBe(3);
    expect(ema[4]).toBe(4);
  });

  it('returns 100 RSI when every change is a gain', () => {
    const rsi = relativeStrengthIndex([1, 2, 3, 4], 2);
    expect(rsi[2]).toBe(100);
    expect(rsi[3]).toBe(100);
  });

  it('keeps MACD histogram equal to macd minus signal', () => {
    const values = Array.from({ length: 60 }, (_, index) => 100 + Math.sin(index / 3) * 5);
    const series = movingAverageConvergenceDivergence(values);
    const defined = series.filter((point) => point.histogram != null);
    expect(defined.length).toBeGreaterThan(0);
    for (const point of defined) {
      expect(point.histogram).toBeCloseTo((point.macd ?? 0) - (point.signal ?? 0), 8);
    }
  });
});
