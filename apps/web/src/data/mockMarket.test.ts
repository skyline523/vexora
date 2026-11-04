import { describe, expect, it } from 'vitest';
import { searchInstruments } from './mockMarket';

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
