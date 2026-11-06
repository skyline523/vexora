import { afterEach, describe, expect, it, vi } from 'vitest';
import { addWatchlistSymbol, fetchWatchlist, removeWatchlistItem } from './watchlist';

describe('watchlist api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches watchlist items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ok: true,
          data: [
            {
              id: '1',
              symbolId: 'binance:spot:BTC/USDT',
              exchange: 'binance',
              marketType: 'spot',
              base: 'BTC',
              quote: 'USDT',
              rawSymbol: 'BTCUSDT',
              sortOrder: 0,
              createdAt: 1,
            },
          ],
          meta: { requestId: 'r1', ts: 1 },
        }),
      ),
    );

    const items = await fetchWatchlist();
    expect(items).toHaveLength(1);
    expect(items[0]?.symbolId).toBe('binance:spot:BTC/USDT');
  });

  it('posts and deletes watchlist symbols', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            id: '1',
            symbolId: 'binance:spot:ETH/USDT',
            exchange: 'binance',
            marketType: 'spot',
            base: 'ETH',
            quote: 'USDT',
            rawSymbol: 'ETHUSDT',
            sortOrder: 1,
            createdAt: 1,
          },
          meta: { requestId: 'r2', ts: 1 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { removed: true, id: '1' },
          meta: { requestId: 'r3', ts: 1 },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await addWatchlistSymbol('binance:spot:ETH/USDT');
    await removeWatchlistItem('1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/watchlist'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/watchlist/1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
