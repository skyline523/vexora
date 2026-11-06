import { describe, expect, it } from 'vitest';
import { parseMarginLeverage } from './margin-leverage';

describe('parseMarginLeverage', () => {
  it('keeps tradable cross-margin multiples and drops the rest', () => {
    expect(
      parseMarginLeverage({
        data: [
          {
            symbol: 'BTCUSDT',
            fullMargin: { isMarginTrade: true, status: 'NORMAL', marginRatio: '10.00000000' },
          },
          {
            symbol: 'SUSHIUSDT',
            fullMargin: { isMarginTrade: true, status: 'NORMAL', marginRatio: '5.00000000' },
          },
          {
            symbol: 'DELISTUSDT',
            fullMargin: { isMarginTrade: true, status: 'DELISTED', marginRatio: '3' },
          },
          {
            symbol: 'NOMARGIN',
            fullMargin: { isMarginTrade: false, status: 'NORMAL', marginRatio: '10' },
          },
        ],
      }),
    ).toEqual({
      BTCUSDT: 10,
      SUSHIUSDT: 5,
    });
  });
});
