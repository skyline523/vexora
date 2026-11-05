import {
  createLogger,
  createMarketSymbol,
  type ExchangeAdapter,
  type ExchangeInfo,
  type GetKlinesParams,
  type Kline,
  type KlineInterval,
  type MarketEvent,
  type MarketSink,
  type MarketSymbol,
  type MarketType,
  type OrderBookSnapshot,
  type Ticker,
  type Trade,
} from '@vexora/shared';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketDataEngine } from './engine';
import { FileKlineHistoryStore } from './history-store';
import { klineSubscriptionKey } from './subscription-key';

const spot = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});
const perp = createMarketSymbol({
  exchange: 'binance',
  marketType: 'usdt_perpetual',
  base: 'BTC',
  quote: 'USDT',
});
const eth = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'ETH',
  quote: 'USDT',
});

const MINUTE = 60_000;
const dirs: string[] = [];

function bar(symbol: MarketSymbol, openTime: number, patch: Partial<Kline> = {}): Kline {
  const closeTime = patch.closeTime ?? openTime + MINUTE - 1;
  return {
    symbolId: symbol.symbolId,
    interval: '1m',
    openTime,
    closeTime,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
    ts: closeTime,
    receivedAt: openTime + 1,
    ...patch,
  };
}

class FakeAdapter implements ExchangeAdapter {
  readonly id = 'binance' as const;
  klineSubs = 0;
  tradeSubs = 0;
  disconnected = false;
  klineCalls = 0;
  readonly klines: Kline[] = [];
  ticker: Ticker | null = null;
  book: OrderBookSnapshot | null = null;
  control?: MarketSink;
  private readonly klineSinks = new Map<string, Set<MarketSink>>();
  private readonly releasedKlineSinks: MarketSink[] = [];
  private readonly tradeSinks = new Set<MarketSink>();

  setEventSink(sink: MarketSink | undefined): void {
    this.control = sink;
  }

  emitKline(kline: Kline): void {
    const sinks = this.klineSinks.get(`${kline.symbolId}:${kline.interval}`);
    if (!sinks) return;
    for (const sink of sinks) {
      sink({ type: 'kline', payload: kline });
    }
  }

  emitReleasedKline(kline: Kline): void {
    for (const sink of this.releasedKlineSinks) {
      sink({ type: 'kline', payload: kline });
    }
  }

  emitTrade(trade: Trade): void {
    for (const sink of this.tradeSinks) {
      sink({ type: 'trade', payload: trade });
    }
  }

  emitControl(event: MarketEvent): void {
    this.control?.(event);
  }

  async getExchangeInfo(marketType: MarketType): Promise<ExchangeInfo> {
    return { exchange: 'binance', marketType, instruments: [] };
  }

  async getTicker(symbol: MarketSymbol): Promise<Ticker> {
    if (!this.ticker || this.ticker.symbolId !== symbol.symbolId) {
      throw new Error(`no ticker for ${symbol.symbolId}`);
    }
    return { ...this.ticker };
  }

  async getKlines(params: GetKlinesParams): Promise<Kline[]> {
    this.klineCalls += 1;
    const rows = this.klines.filter((kline) => {
      if (kline.symbolId !== params.symbol.symbolId || kline.interval !== params.interval) {
        return false;
      }
      if (params.startTime != null && kline.openTime < params.startTime) return false;
      if (params.endTime != null && kline.openTime > params.endTime) return false;
      return true;
    });
    const limit = params.limit ?? rows.length;
    const page = params.startTime == null ? rows.slice(-limit) : rows.slice(0, limit);
    return page.map((kline) => ({ ...kline }));
  }

  async getOrderBookSnapshot(symbol: MarketSymbol): Promise<OrderBookSnapshot> {
    if (!this.book || this.book.symbolId !== symbol.symbolId) {
      throw new Error(`no book for ${symbol.symbolId}`);
    }
    return {
      ...this.book,
      bids: this.book.bids.map((level) => ({ ...level })),
      asks: this.book.asks.map((level) => ({ ...level })),
    };
  }

  subscribeKlines(symbol: MarketSymbol, interval: KlineInterval, sink: MarketSink) {
    this.klineSubs += 1;
    const key = `${symbol.symbolId}:${interval}`;
    const sinks = this.klineSinks.get(key) ?? new Set<MarketSink>();
    sinks.add(sink);
    this.klineSinks.set(key, sinks);
    return {
      unsubscribe: () => {
        this.klineSubs -= 1;
        sinks.delete(sink);
        if (sinks.size === 0) this.klineSinks.delete(key);
        this.releasedKlineSinks.push(sink);
      },
    };
  }

  subscribeTrades(symbol: MarketSymbol, sink: MarketSink) {
    this.tradeSubs += 1;
    this.tradeSinks.add(sink);
    void symbol;
    return {
      unsubscribe: () => {
        this.tradeSubs -= 1;
        this.tradeSinks.delete(sink);
      },
    };
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }
}

function engineFor(
  adapter: FakeAdapter,
  patch: { now?: number; maxKlines?: number; history?: FileKlineHistoryStore } = {},
) {
  const now = patch.now ?? 1_000_000;
  return new MarketDataEngine({
    adapters: [adapter],
    logger: createLogger('market-core-test', { level: 'error' }),
    maxKlinesPerSeries: patch.maxKlines,
    history: patch.history,
    staleAfterMs: 30_000,
    now: () => now,
  });
}

describe('MarketDataEngine', () => {
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('uses one upstream subscription per key and isolates spot from perpetual', async () => {
    const adapter = new FakeAdapter();
    const engine = engineFor(adapter);
    const spotEvents: Kline[] = [];
    const perpEvents: Kline[] = [];
    const first = engine.subscribeKlines(spot, '1m', (event) => {
      if (event.type === 'kline') spotEvents.push(event.payload);
    });
    const second = engine.subscribeKlines(spot, '1m');
    engine.subscribeKlines(perp, '1m', (event) => {
      if (event.type === 'kline') perpEvents.push(event.payload);
    });

    expect(adapter.klineSubs).toBe(2);
    adapter.emitKline(bar(spot, 0, { close: 10 }));
    adapter.emitKline(bar(perp, 0, { close: 20 }));

    expect(engine.getCachedKlines(spot.symbolId, '1m').map((kline) => kline.close)).toEqual([10]);
    expect(engine.getCachedKlines(perp.symbolId, '1m').map((kline) => kline.close)).toEqual([20]);
    expect(spotEvents).toHaveLength(1);
    expect(perpEvents).toHaveLength(1);
    expect(klineSubscriptionKey(spot.symbolId, '1m')).toBe('kline:binance:spot:BTC/USDT:1m');

    first.unsubscribe();
    expect(adapter.klineSubs).toBe(2);
    second.unsubscribe();
    expect(adapter.klineSubs).toBe(1);
    await engine.disconnect();
    expect(adapter.disconnected).toBe(true);
  });

  it('stops delivering a symbol after its subscription is released', async () => {
    const adapter = new FakeAdapter();
    const engine = engineFor(adapter);
    const seen: string[] = [];
    const sub = engine.subscribeKlines(spot, '1m', (event) => {
      if (event.type === 'kline') seen.push(event.payload.symbolId);
    });

    adapter.emitKline(bar(spot, 0));
    sub.unsubscribe();
    adapter.emitKline(bar(spot, MINUTE));
    adapter.emitReleasedKline(bar(spot, MINUTE * 2));

    expect(seen).toEqual([spot.symbolId]);
    expect(adapter.klineSubs).toBe(0);
    expect(engine.getCachedKlines(spot.symbolId, '1m')).toHaveLength(1);
    await engine.disconnect();
  });

  it('switches symbol and interval without forwarding the previous stream', async () => {
    const adapter = new FakeAdapter();
    const engine = engineFor(adapter);
    const seen: Array<{ symbolId: string; interval: KlineInterval }> = [];
    const sub = engine.subscribeKlines(spot, '1m', (event) => {
      if (event.type === 'kline') {
        seen.push({ symbolId: event.payload.symbolId, interval: event.payload.interval });
      }
    });

    adapter.emitKline(bar(spot, 0));
    engine.switchKlines(sub, { symbol: eth, interval: '1m' });
    adapter.emitReleasedKline(bar(spot, MINUTE));
    adapter.emitKline(bar(eth, 0, { close: 8 }));
    engine.switchKlines(sub, { symbol: eth, interval: '5m' });
    adapter.emitKline(bar(eth, 0, { interval: '5m', close: 9 }));

    expect(seen).toEqual([
      { symbolId: spot.symbolId, interval: '1m' },
      { symbolId: eth.symbolId, interval: '1m' },
      { symbolId: eth.symbolId, interval: '5m' },
    ]);
    expect(adapter.klineSubs).toBe(1);
    await engine.disconnect();
  });

  it('merges history and realtime onto one candle and ignores stale ticks', async () => {
    const adapter = new FakeAdapter();
    const open = [0, MINUTE, MINUTE * 2];
    adapter.klines.push(
      ...open.map((openTime, index) =>
        bar(spot, openTime, { close: index + 1, closed: index < 2 }),
      ),
    );
    const engine = engineFor(adapter);
    const sub = engine.subscribeKlines(spot, '1m');
    const loaded = await engine.loadKlines({ symbol: spot, interval: '1m', limit: 10 });

    adapter.emitKline(
      bar(spot, MINUTE * 2, {
        close: 30,
        closed: false,
        ts: MINUTE * 2 + 5_000,
        receivedAt: 50,
      }),
    );
    adapter.emitKline(
      bar(spot, MINUTE * 2, {
        close: 1,
        closed: false,
        ts: MINUTE * 2 + 1_000,
        receivedAt: 80,
      }),
    );

    const cached = engine.getCachedKlines(spot.symbolId, '1m');
    expect(loaded.map((kline) => kline.openTime)).toEqual(open);
    expect(cached).toHaveLength(3);
    expect(cached[2]).toMatchObject({ close: 30, closed: false });
    sub.unsubscribe();
    await engine.disconnect();
  });

  it('fills a realtime gap from REST and keeps the series ordered', async () => {
    const adapter = new FakeAdapter();
    adapter.klines.push(bar(spot, 0), bar(spot, MINUTE), bar(spot, MINUTE * 2));
    const engine = engineFor(adapter);
    const events: MarketEvent[] = [];
    engine.subscribeKlines(spot, '1m', (event) => events.push(event));

    adapter.emitKline(bar(spot, 0));
    adapter.emitKline(bar(spot, MINUTE * 2));
    await engine.whenIdle();

    expect(engine.getCachedKlines(spot.symbolId, '1m').map((kline) => kline.openTime)).toEqual([
      0,
      MINUTE,
      MINUTE * 2,
    ]);
    expect(events.some((event) => event.type === 'gap_detected')).toBe(true);
    expect(adapter.klineCalls).toBeGreaterThan(0);
    await engine.disconnect();
  });

  it('refills candles missing after a reconnect', async () => {
    const adapter = new FakeAdapter();
    const now = MINUTE * 3;
    adapter.klines.push(
      bar(spot, MINUTE, { receivedAt: 2 }),
      bar(spot, MINUTE * 2, { receivedAt: 3 }),
    );
    const engine = engineFor(adapter, { now });
    engine.subscribeKlines(spot, '1m');
    adapter.emitKline(bar(spot, 0, { receivedAt: 1 }));
    expect(adapter.klineCalls).toBe(0);

    adapter.emitControl({
      type: 'connection',
      payload: {
        exchange: 'binance',
        marketType: 'spot',
        channel: 'market_stream',
        state: 'disconnected',
        ts: now,
      },
    });
    adapter.emitControl({
      type: 'connection',
      payload: {
        exchange: 'binance',
        marketType: 'spot',
        channel: 'market_stream',
        state: 'connected',
        ts: now,
      },
    });
    await engine.whenIdle();

    expect(engine.getCachedKlines(spot.symbolId, '1m').map((kline) => kline.openTime)).toEqual([
      0,
      MINUTE,
      MINUTE * 2,
    ]);
    await engine.disconnect();
  });

  it('loads an older page without dropping the live candle', async () => {
    const adapter = new FakeAdapter();
    for (const openTime of [0, MINUTE, MINUTE * 2, MINUTE * 3, MINUTE * 4]) {
      adapter.klines.push(bar(spot, openTime, { close: openTime }));
    }
    const engine = engineFor(adapter);
    engine.subscribeKlines(spot, '1m');
    adapter.emitKline(bar(spot, MINUTE * 3, { close: 3, receivedAt: 10 }));
    adapter.emitKline(
      bar(spot, MINUTE * 4, {
        close: 4,
        receivedAt: 11,
        closed: false,
        ts: MINUTE * 4 + 1_000,
      }),
    );

    const page = await engine.loadKlines({
      symbol: spot,
      interval: '1m',
      endTime: MINUTE * 3,
      limit: 2,
    });
    adapter.emitKline(
      bar(spot, MINUTE * 4, { close: 42, ts: MINUTE * 4 + 8_000, receivedAt: 12, closed: false }),
    );

    expect(page.map((kline) => kline.openTime)).toEqual([MINUTE, MINUTE * 2]);
    const cached = engine.getCachedKlines(spot.symbolId, '1m');
    expect(cached.at(-1)).toMatchObject({ openTime: MINUTE * 4, close: 42 });
    expect(cached.some((kline) => kline.openTime === MINUTE * 3)).toBe(true);
    await engine.disconnect();
  });

  it('reads history from disk before calling REST', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'vexora-market-'));
    dirs.push(dataDir);
    const history = new FileKlineHistoryStore(dataDir);
    const openTime = Date.UTC(2024, 0, 2, 0, 0);
    await history.write([
      bar(spot, openTime, { close: 7 }),
      bar(spot, openTime + MINUTE, { close: 8 }),
    ]);

    const adapter = new FakeAdapter();
    const engine = engineFor(adapter, { history });
    const rows = await engine.loadKlines({ symbol: spot, interval: '1m', limit: 2 });

    expect(adapter.klineCalls).toBe(0);
    expect(rows.map((kline) => kline.close)).toEqual([7, 8]);
    await engine.disconnect();
  });

  it('caches trades, order books, and ticker freshness', async () => {
    const adapter = new FakeAdapter();
    adapter.book = {
      symbolId: spot.symbolId,
      bids: [
        { price: 1, qty: 1 },
        { price: 3, qty: 2 },
      ],
      asks: [
        { price: 9, qty: 1 },
        { price: 4, qty: 1 },
      ],
      ts: 10,
      receivedAt: 10,
    };
    adapter.ticker = {
      symbolId: spot.symbolId,
      exchange: 'binance',
      marketType: 'spot',
      lastPrice: 42,
      ts: 20,
      receivedAt: 20,
    };
    const engine = engineFor(adapter, { now: 20 });
    const books: OrderBookSnapshot[] = [];
    engine.subscribeOrderBook(spot, (event) => {
      if (event.type === 'orderbook_snapshot') books.push(event.payload);
    });
    await engine.whenIdle();

    expect(books[0]?.bids.map((level) => level.price)).toEqual([3, 1]);
    expect(books[0]?.asks.map((level) => level.price)).toEqual([4, 9]);

    adapter.book = {
      ...adapter.book,
      bids: [{ price: 5, qty: 1 }],
      receivedAt: 21,
    };
    await engine.refreshOrderBook(spot);
    expect(engine.getCachedOrderBook(spot.symbolId)?.bids).toEqual([{ price: 5, qty: 1 }]);

    const trades = engine.subscribeTrades(spot);
    adapter.emitTrade({
      symbolId: spot.symbolId,
      tradeId: 'b',
      price: 2,
      qty: 1,
      side: 'buy',
      ts: 2,
      receivedAt: 22,
    });
    adapter.emitTrade({
      symbolId: spot.symbolId,
      tradeId: 'a',
      price: 1,
      qty: 1,
      side: 'sell',
      ts: 1,
      receivedAt: 23,
    });
    adapter.emitTrade({
      symbolId: spot.symbolId,
      tradeId: 'b',
      price: 9,
      qty: 1,
      side: 'buy',
      ts: 3,
      receivedAt: 24,
    });
    expect(engine.getCachedTrades(spot.symbolId).map((trade) => trade.tradeId)).toEqual(['a', 'b']);

    expect(engine.freshness(spot.symbolId).stale).toBe(false);
    const ticker = await engine.getTicker(spot);
    expect(ticker.lastPrice).toBe(42);
    expect(engine.getCachedTicker(spot.symbolId)?.lastPrice).toBe(42);

    trades.unsubscribe();
    expect(adapter.tradeSubs).toBe(0);
    await engine.disconnect();
  });

  it('marks a quiet symbol stale', () => {
    const adapter = new FakeAdapter();
    let now = 1_000;
    const engine = new MarketDataEngine({
      adapters: [adapter],
      logger: createLogger('market-core-test', { level: 'error' }),
      staleAfterMs: 1_000,
      now: () => now,
    });
    engine.subscribeKlines(spot, '1m');
    adapter.emitKline(bar(spot, 0, { receivedAt: 1_000 }));
    expect(engine.freshness(spot.symbolId)).toMatchObject({ stale: false, lastEventTs: 1_000 });
    now = 3_000;
    expect(engine.freshness(spot.symbolId)).toMatchObject({ stale: true, code: 'STALE_DATA' });
  });
});
