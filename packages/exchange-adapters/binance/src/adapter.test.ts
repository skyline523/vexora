import { createMarketSymbol, type MarketEvent } from '@vexora/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceAdapter } from './adapter';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  readonly url: string;
  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    });
  }

  addEventListener(type: string, handler: (event: { data?: unknown }) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  send(_data: string): void {
    // no-op for unit tests
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  emit(type: string, data?: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ data });
    }
  }

  pushCombined(stream: string, payload: unknown): void {
    this.emit('message', JSON.stringify({ stream, data: payload }));
  }
}

const btcSpot = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

describe('BinanceAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches exchange info / ticker / klines / depth via REST', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) {
        return jsonResponse({
          timezone: 'UTC',
          serverTime: 123,
          symbols: [
            {
              symbol: 'BTCUSDT',
              status: 'TRADING',
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              filters: [
                { filterType: 'PRICE_FILTER', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', stepSize: '0.00001' },
              ],
            },
          ],
        });
      }
      if (url.includes('/api/v3/ticker/24hr')) {
        return jsonResponse({
          symbol: 'BTCUSDT',
          lastPrice: '65000',
          bidPrice: '64999',
          askPrice: '65001',
          highPrice: '66000',
          lowPrice: '64000',
          volume: '100',
          quoteVolume: '6500000',
          priceChangePercent: '1.2',
          closeTime: 1_700_000_000_000,
        });
      }
      if (url.includes('/api/v3/klines')) {
        return jsonResponse([
          [
            1_700_000_000_000,
            '1',
            '2',
            '0.5',
            '1.5',
            '10',
            1_700_000_059_999,
            '15',
            42,
            '4',
            '6',
            '0',
          ],
        ]);
      }
      if (url.includes('/api/v3/depth')) {
        return jsonResponse({
          lastUpdateId: 9,
          bids: [['65000', '1']],
          asks: [['65001', '2']],
        });
      }
      return jsonResponse({}, 404);
    });

    const adapter = new BinanceAdapter({
      rest: { fetchImpl: fetchImpl as unknown as typeof fetch },
      ws: {
        wsFactory: (url) => new MockWebSocket(url) as unknown as WebSocket,
      },
    });

    const info = await adapter.getExchangeInfo('spot');
    expect(info.instruments).toHaveLength(1);
    expect(info.instruments[0]?.symbol.symbolId).toBe('binance:spot:BTC/USDT');

    const ticker = await adapter.getTicker(btcSpot);
    expect(ticker.lastPrice).toBe(65000);

    const klines = await adapter.getKlines({
      symbol: btcSpot,
      interval: '1m',
      limit: 1,
    });
    expect(klines[0]?.close).toBe(1.5);

    const book = await adapter.getOrderBookSnapshot(btcSpot, 100);
    expect(book.sequence).toBe('9');

    await adapter.disconnect();
  });

  it('subscribes to kline/trade and releases on unsubscribe', async () => {
    let socket: MockWebSocket | undefined;
    const adapter = new BinanceAdapter({
      rest: {
        fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
      },
      ws: {
        wsFactory: (url) => {
          socket = new MockWebSocket(url);
          return socket as unknown as WebSocket;
        },
        controlMinIntervalMs: 0,
        reconnectDelaysMs: [10],
      },
    });

    const events: MarketEvent[] = [];
    const klineSub = adapter.subscribeKlines(btcSpot, '1m', (event) => {
      events.push(event);
    });
    const tradeSub = adapter.subscribeTrades(btcSpot, (event) => {
      events.push(event);
    });

    await vi.waitFor(() => {
      expect(socket?.readyState).toBe(MockWebSocket.OPEN);
    });

    socket?.pushCombined('btcusdt@kline_1m', {
      e: 'kline',
      E: 100,
      s: 'BTCUSDT',
      k: {
        t: 1,
        T: 2,
        s: 'BTCUSDT',
        i: '1m',
        o: '1',
        c: '2',
        h: '3',
        l: '0.5',
        v: '9',
        n: 3,
        x: false,
        q: '18',
      },
    });
    socket?.pushCombined('btcusdt@trade', {
      e: 'trade',
      E: 10,
      s: 'BTCUSDT',
      t: 55,
      p: '100',
      q: '0.1',
      T: 11,
      m: false,
    });

    expect(events.map((e) => e.type)).toEqual(['kline', 'trade']);

    klineSub.unsubscribe();
    tradeSub.unsubscribe();
    await adapter.disconnect();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'x-mbx-used-weight-1m': '1',
    },
  });
}
