import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchInstruments, klineQuery } from './market';

describe('klineQuery', () => {
  it('encodes the history request used by the chart', () => {
    expect(
      klineQuery({
        symbolId: 'binance:spot:BTC/USDT',
        interval: '15m',
        limit: 500,
        endTime: 1_700_000_000_000,
      }),
    ).toBe('symbolId=binance%3Aspot%3ABTC%2FUSDT&interval=15m&limit=500&endTime=1700000000000');
  });
});

describe('fetchInstruments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests searchable instruments for the active market', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          exchange: 'binance',
          marketType: 'spot',
          quote: 'USDT',
          instruments: [
            {
              symbol: {
                exchange: 'binance',
                marketType: 'spot',
                base: 'BTC',
                quote: 'USDT',
                rawSymbol: 'BTCUSDT',
                symbolId: 'binance:spot:BTC/USDT',
              },
              pricePrecision: 2,
              quantityPrecision: 6,
              status: 'trading',
            },
          ],
        },
        meta: { requestId: 'r1', ts: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const instruments = await fetchInstruments({ marketType: 'spot', q: 'btc', limit: 8 });
    expect(instruments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/markets/instruments?'),
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string] | undefined;
    expect(String(firstCall?.[0])).toContain('q=btc');
  });
});
