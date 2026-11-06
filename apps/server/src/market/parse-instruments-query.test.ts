import { describe, expect, it } from 'vitest';
import { parseInstrumentsQuery } from './parse-instruments-query';

describe('parseInstrumentsQuery', () => {
  it('parses defaults for binance spot USDT search', () => {
    expect(parseInstrumentsQuery({ marketType: 'spot', q: 'btc' })).toEqual({
      exchange: 'binance',
      marketType: 'spot',
      query: 'btc',
      quote: 'USDT',
      limit: 20,
    });
  });

  it('rejects unsupported market types', () => {
    expect(() => parseInstrumentsQuery({ marketType: 'coin' })).toThrow(/marketType/);
  });
});
