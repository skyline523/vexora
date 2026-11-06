import {
  buildSymbolId,
  createLogger,
  type ExchangeAdapter,
  type ExchangeId,
  type GapInfo,
  type GetKlinesParams,
  type Kline,
  type KlineInterval,
  type Logger,
  type MarketError,
  type MarketEvent,
  type MarketSink,
  type MarketSymbol,
  type MarketType,
  type OrderBookSnapshot,
  type Subscription,
  type Ticker,
  type Trade,
} from '@vexora/shared';
import { ExchangeRegistry } from './exchange-registry';
import { detectKlineGaps, gapSince } from './gap';
import { GapFiller } from './gap-filler';
import type { KlineHistoryStore } from './history-store';
import { mergeKlineLists, selectKlines } from './kline-merge';
import { KlineStore } from './kline-store';
import { OrderBookStore } from './orderbook-store';
import {
  klineSubscriptionKey,
  orderbookSubscriptionKey,
  tickerSubscriptionKey,
  tradeSubscriptionKey,
} from './subscription-key';
import { SubscriptionRegistry } from './subscription-registry';
import { TradeBuffer } from './trade-buffer';

const DEFAULT_MAX_KLINES = 2000;
const DEFAULT_MAX_TRADES = 300;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_MAX_GAP_BARS = 5000;
const DEFAULT_KLINE_LIMIT = 500;
const MAX_KLINE_LIMIT = 1500;

export interface MarketDataEngineOptions {
  adapters: ExchangeAdapter[];
  logger?: Logger;
  maxKlinesPerSeries?: number;
  maxTradesPerSymbol?: number;
  maxGapBars?: number;
  /** Feed is stale when no event has been received within this window. */
  staleAfterMs?: number;
  history?: KlineHistoryStore;
  now?: () => number;
}

export interface EngineSubscription {
  readonly id: string;
  unsubscribe(): void;
}

export interface KlineSwitchTarget {
  symbol: MarketSymbol;
  interval: KlineInterval;
}

/** `lastEventTs` is the local receive time of the newest cached event. */
export interface Freshness {
  symbolId: string;
  lastEventTs: number | null;
  stale: boolean;
  code?: 'STALE_DATA';
}

type Channel = 'kline' | 'trade' | 'orderbook' | 'ticker';

interface LiveSubscription {
  id: string;
  key: string;
  channel: Channel;
  symbol: MarketSymbol;
  interval?: KlineInterval;
  listener?: MarketSink;
}

interface SeriesTarget {
  symbol: MarketSymbol;
  interval?: KlineInterval;
  channel: Channel;
}

interface ConnectionAwareAdapter extends ExchangeAdapter {
  setEventSink?: (sink: MarketSink | undefined) => void;
}

function clampLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_KLINE_LIMIT;
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid kline limit: ${String(limit)}`);
  }
  return Math.min(Math.floor(value), MAX_KLINE_LIMIT);
}

function toMarketError(error: unknown, symbolId: string | undefined, ts: number): MarketError {
  const record =
    typeof error === 'object' && error != null
      ? (error as { code?: unknown; retryable?: unknown })
      : undefined;
  return {
    code: typeof record?.code === 'string' ? record.code : 'MARKET_UPSTREAM',
    message: error instanceof Error ? error.message : String(error),
    symbolId,
    retryable: record?.retryable === true,
    ts,
  };
}

function bindAdapterEvents(adapter: ExchangeAdapter, sink: MarketSink): void {
  const setEventSink = (adapter as ConnectionAwareAdapter).setEventSink;
  if (typeof setEventSink === 'function') {
    setEventSink.call(adapter, sink);
  }
}

/**
 * Normalizes adapter streams into one cache and event bus.
 * Spot and perpetual series are isolated by `symbolId`.
 */
export class MarketDataEngine {
  private readonly exchanges: ExchangeRegistry;
  private readonly registry = new SubscriptionRegistry();
  private readonly klines: KlineStore;
  private readonly trades: TradeBuffer;
  private readonly books = new OrderBookStore();
  private readonly tickers = new Map<string, Ticker>();
  private readonly filler: GapFiller;
  private readonly logger: Logger;
  private readonly history?: KlineHistoryStore;
  private readonly now: () => number;
  private readonly staleAfterMs: number;
  private readonly listeners = new Set<MarketSink>();
  private readonly subs = new Map<string, LiveSubscription>();
  private readonly targets = new Map<string, SeriesTarget>();
  private readonly lastReceivedAt = new Map<string, number>();
  private readonly needsRecover = new Set<string>();
  private readonly filling = new Set<string>();
  private readonly inflight = new Set<Promise<unknown>>();
  private nextId = 1;
  private closed = false;

  constructor(options: MarketDataEngineOptions) {
    if (options.adapters.length === 0) {
      throw new Error('MarketDataEngine requires at least one exchange adapter');
    }
    this.logger = options.logger ?? createLogger('market-core');
    this.now = options.now ?? Date.now;
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;
    this.history = options.history;
    this.klines = new KlineStore(options.maxKlinesPerSeries ?? DEFAULT_MAX_KLINES);
    this.trades = new TradeBuffer(options.maxTradesPerSymbol ?? DEFAULT_MAX_TRADES);
    this.exchanges = new ExchangeRegistry();
    for (const adapter of options.adapters) {
      this.exchanges.register(adapter);
      bindAdapterEvents(adapter, (event) => this.onAdapterControl(event));
    }
    this.filler = new GapFiller(
      (params) => this.exchanges.get(params.symbol.exchange).getKlines(params),
      options.maxGapBars ?? DEFAULT_MAX_GAP_BARS,
    );
  }

  subscribeEvents(listener: MarketSink): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeKlines(
    symbol: MarketSymbol,
    interval: KlineInterval,
    listener?: MarketSink,
  ): EngineSubscription {
    return this.openSubscription('kline', symbol, interval, listener);
  }

  subscribeTrades(symbol: MarketSymbol, listener?: MarketSink): EngineSubscription {
    return this.openSubscription('trade', symbol, undefined, listener);
  }

  subscribeTicker(symbol: MarketSymbol, listener?: MarketSink): EngineSubscription {
    return this.openSubscription('ticker', symbol, undefined, listener);
  }

  subscribeOrderBook(symbol: MarketSymbol, listener?: MarketSink): EngineSubscription {
    return this.openSubscription('orderbook', symbol, undefined, listener);
  }

  /**
   * Move one kline subscriber onto another symbol or interval.
   * The previous upstream is released when it has no remaining subscribers.
   */
  switchKlines(subscription: Pick<EngineSubscription, 'id'>, next: KlineSwitchTarget): void {
    this.assertOpen();
    const sub = this.subs.get(subscription.id);
    if (!sub || sub.channel !== 'kline' || !sub.interval) {
      throw new Error(`Kline subscription not found: ${subscription.id}`);
    }
    this.assertSymbol(next.symbol);
    const nextKey = klineSubscriptionKey(next.symbol.symbolId, next.interval);
    if (sub.key === nextKey) return;

    const previous = {
      key: sub.key,
      symbol: sub.symbol,
      interval: sub.interval,
    };
    sub.key = nextKey;
    sub.symbol = next.symbol;
    sub.interval = next.interval;
    this.targets.set(nextKey, {
      channel: 'kline',
      symbol: next.symbol,
      interval: next.interval,
    });

    try {
      this.registry.acquire(nextKey, sub.id, () =>
        this.openKlineUpstream(next.symbol, next.interval),
      );
    } catch (error) {
      sub.key = previous.key;
      sub.symbol = previous.symbol;
      sub.interval = previous.interval;
      if (!this.registry.isActive(nextKey)) this.targets.delete(nextKey);
      throw error;
    }

    this.registry.release(previous.key, sub.id);
    if (!this.registry.isActive(previous.key)) this.targets.delete(previous.key);
    this.logger.debug('subscription.switch', { from: previous.key, to: nextKey });
  }

  async loadKlines(params: GetKlinesParams): Promise<Kline[]> {
    this.assertOpen();
    this.assertSymbol(params.symbol);
    const limit = clampLimit(params.limit);
    const { symbol, interval } = params;
    const startTime = params.startTime;
    const endTime = params.endTime;
    if (startTime != null && endTime != null && startTime >= endTime) {
      throw new Error('startTime must be earlier than endTime');
    }

    const query = { startTime, endTime, limit };
    let combined = this.klines.query(symbol.symbolId, interval, query);

    if (combined.length < limit && this.history) {
      const stored = await this.history.read({ symbol, interval, ...query });
      this.klines.upsertMany(stored);
      combined = selectKlines(mergeKlineLists([combined, stored]), query);
    }

    if (combined.length < limit) {
      const fetched = await this.exchanges.get(symbol.exchange).getKlines({
        symbol,
        interval,
        startTime,
        endTime: endTime == null ? undefined : endTime - 1,
        limit,
      });
      await this.persistClosed(fetched);
      this.klines.upsertMany(fetched);
      combined = selectKlines(mergeKlineLists([combined, fetched]), query);
    }

    const gaps = detectKlineGaps(combined, interval, symbol.symbolId);
    if (gaps.length > 0) {
      const filled = await this.repair(
        symbol,
        gaps,
        this.registry.isActive(klineSubscriptionKey(symbol.symbolId, interval)),
      );
      combined = selectKlines(mergeKlineLists([combined, filled]), query);
    }

    return combined;
  }

  getCachedKlines(symbolId: string, interval: KlineInterval): Kline[] {
    return this.klines.query(symbolId, interval);
  }

  getCachedTrades(symbolId: string): Trade[] {
    return this.trades.get(symbolId);
  }

  getCachedOrderBook(symbolId: string): OrderBookSnapshot | undefined {
    return this.books.get(symbolId);
  }

  getCachedTicker(symbolId: string): Ticker | undefined {
    const ticker = this.tickers.get(symbolId);
    return ticker ? { ...ticker } : undefined;
  }

  async getTicker(symbol: MarketSymbol): Promise<Ticker> {
    this.assertOpen();
    this.assertSymbol(symbol);
    try {
      const ticker = await this.exchanges.get(symbol.exchange).getTicker(symbol);
      this.ingestTicker(ticker);
      return { ...ticker };
    } catch (error) {
      this.fail(error, symbol.symbolId);
      throw error;
    }
  }

  async refreshOrderBook(symbol: MarketSymbol, depth?: number): Promise<OrderBookSnapshot> {
    this.assertOpen();
    this.assertSymbol(symbol);
    try {
      const snapshot = await this.exchanges
        .get(symbol.exchange)
        .getOrderBookSnapshot(symbol, depth);
      const stored = this.books.set(snapshot);
      this.touch(symbol.symbolId, snapshot.receivedAt);
      this.publish(
        { type: 'orderbook_snapshot', payload: stored },
        orderbookSubscriptionKey(symbol.symbolId),
      );
      return stored;
    } catch (error) {
      this.fail(error, symbol.symbolId);
      throw error;
    }
  }

  freshness(symbolId: string): Freshness {
    const lastEventTs = this.lastReceivedAt.get(symbolId) ?? null;
    const stale = lastEventTs == null || this.now() - lastEventTs > this.staleAfterMs;
    return stale
      ? { symbolId, lastEventTs, stale: true, code: 'STALE_DATA' }
      : { symbolId, lastEventTs, stale: false };
  }

  async whenIdle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.registry.releaseAll();
    this.subs.clear();
    this.targets.clear();
    await this.whenIdle();
    await Promise.all(this.exchanges.list().map((adapter) => adapter.disconnect()));
  }

  private openSubscription(
    channel: Channel,
    symbol: MarketSymbol,
    interval: KlineInterval | undefined,
    listener?: MarketSink,
  ): EngineSubscription {
    this.assertOpen();
    this.assertSymbol(symbol);
    if (channel === 'kline' && !interval) {
      throw new Error('Kline subscriptions require an interval');
    }

    const key =
      channel === 'kline'
        ? klineSubscriptionKey(symbol.symbolId, interval!)
        : channel === 'trade'
          ? tradeSubscriptionKey(symbol.symbolId)
          : channel === 'ticker'
            ? tickerSubscriptionKey(symbol.symbolId)
            : orderbookSubscriptionKey(symbol.symbolId);
    const id = `sub_${this.nextId++}`;
    const sub: LiveSubscription = { id, key, channel, symbol, interval, listener };
    this.subs.set(id, sub);
    this.targets.set(key, { channel, symbol, interval });

    try {
      this.registry.acquire(key, id, () => this.openUpstream(sub));
    } catch (error) {
      this.subs.delete(id);
      if (!this.registry.isActive(key)) this.targets.delete(key);
      throw error;
    }

    this.logger.debug('subscription.open', { key, id });
    return {
      id,
      unsubscribe: () => this.releaseSub(id),
    };
  }

  private openUpstream(sub: LiveSubscription): Subscription {
    const adapter = this.exchanges.get(sub.symbol.exchange);
    if (sub.channel === 'kline' && sub.interval) {
      return this.openKlineUpstream(sub.symbol, sub.interval);
    }
    if (sub.channel === 'trade') {
      return adapter.subscribeTrades(sub.symbol, (event) => {
        if (event.type === 'trade') {
          this.ingestTrade(event.payload);
          return;
        }
        this.publish(event);
      });
    }
    if (sub.channel === 'ticker') {
      if (adapter.subscribeTicker) {
        return adapter.subscribeTicker(sub.symbol, (event) => {
          if (event.type === 'ticker') {
            this.ingestTicker(event.payload);
            return;
          }
          this.publish(event);
        });
      }
      return this.pollTicker(sub.symbol);
    }

    if (sub.channel === 'orderbook') {
      if (adapter.subscribeOrderBook) {
        return adapter.subscribeOrderBook(sub.symbol, (event) => {
          if (event.type === 'orderbook_snapshot') {
            this.ingestBook(event.payload);
            return;
          }
          if (event.type === 'orderbook_delta') {
            this.publish(event, orderbookSubscriptionKey(sub.symbol.symbolId));
            return;
          }
          this.publish(event);
        });
      }
      return this.pollOrderBook(sub.symbol);
    }

    throw new Error(`Unsupported channel: ${sub.channel}`);
  }

  private pollOrderBook(symbol: MarketSymbol, depth = 20): Subscription {
    let stopped = false;
    const pull = (): void => {
      if (stopped) return;
      void this.refreshOrderBook(symbol, depth).catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, 1_000);
    return {
      unsubscribe() {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  private openKlineUpstream(symbol: MarketSymbol, interval: KlineInterval): Subscription {
    return this.exchanges.get(symbol.exchange).subscribeKlines(symbol, interval, (event) => {
      if (event.type === 'kline') {
        this.ingestKline(event.payload);
        return;
      }
      this.publish(event);
    });
  }

  private releaseSub(id: string): void {
    const sub = this.subs.get(id);
    if (!sub) return;
    this.subs.delete(id);
    this.registry.release(sub.key, id);
    if (!this.registry.isActive(sub.key)) this.targets.delete(sub.key);
    this.logger.debug('subscription.close', { key: sub.key, id });
  }

  private ingestKline(kline: Kline): void {
    const key = klineSubscriptionKey(kline.symbolId, kline.interval);
    if (!this.registry.isActive(key)) return;
    if (!this.klines.upsert(kline)) return;

    this.touch(kline.symbolId, kline.receivedAt);
    if (kline.closed && this.history) {
      this.track(
        this.persistClosed([kline]).catch((error: unknown) => this.fail(error, kline.symbolId)),
      );
    }
    this.publish({ type: 'kline', payload: kline }, key);

    const target = this.targets.get(key);
    if (!target) return;
    const gaps = this.klines.gapsAround(kline);
    if (gaps.length === 0) return;
    this.track(
      this.repair(target.symbol, gaps, true).catch((error: unknown) =>
        this.fail(error, kline.symbolId),
      ),
    );
  }

  private ingestTicker(ticker: Ticker): void {
    this.tickers.set(ticker.symbolId, { ...ticker });
    this.touch(ticker.symbolId, ticker.receivedAt);
    this.publish({ type: 'ticker', payload: ticker }, tickerSubscriptionKey(ticker.symbolId));
  }

  private pollTicker(symbol: MarketSymbol): Subscription {
    let stopped = false;
    const pull = (): void => {
      if (stopped) return;
      void this.getTicker(symbol).catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, 2_000);
    return {
      unsubscribe() {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  private ingestTrade(trade: Trade): void {
    const key = tradeSubscriptionKey(trade.symbolId);
    if (!this.registry.isActive(key)) return;
    if (!this.trades.push(trade)) return;
    this.touch(trade.symbolId, trade.receivedAt);
    this.publish({ type: 'trade', payload: trade }, key);
  }

  private ingestBook(snapshot: OrderBookSnapshot): void {
    const key = orderbookSubscriptionKey(snapshot.symbolId);
    if (!this.registry.isActive(key)) return;
    const stored = this.books.set(snapshot);
    this.touch(snapshot.symbolId, snapshot.receivedAt);
    this.publish({ type: 'orderbook_snapshot', payload: stored }, key);
  }

  private async repair(symbol: MarketSymbol, gaps: GapInfo[], publish: boolean): Promise<Kline[]> {
    const filled: Kline[] = [];
    for (const gap of gaps) {
      if (this.closed) break;
      const token = `${gap.symbolId}|${gap.interval}|${gap.fromOpenTime}|${gap.toOpenTime}`;
      if (this.filling.has(token)) continue;
      this.filling.add(token);
      try {
        const pulled = await this.filler.pull(symbol, gap);
        if (this.closed) break;
        const accepted = this.klines.upsertMany(pulled);
        await this.persistClosed(pulled);
        filled.push(...pulled);
        const key = klineSubscriptionKey(symbol.symbolId, gap.interval);
        if (publish && this.registry.isActive(key)) {
          this.publish({ type: 'gap_detected', payload: gap }, key);
          for (const kline of accepted) {
            this.publish({ type: 'kline', payload: kline }, key);
          }
        }
        if (pulled.length === 0) {
          this.logger.warn('gap.fill_empty', {
            symbolId: gap.symbolId,
            interval: gap.interval,
            fromOpenTime: gap.fromOpenTime,
            toOpenTime: gap.toOpenTime,
          });
        } else {
          this.logger.info('gap.fill', {
            symbolId: gap.symbolId,
            interval: gap.interval,
            fromOpenTime: gap.fromOpenTime,
            toOpenTime: gap.toOpenTime,
            count: pulled.length,
          });
        }
      } finally {
        this.filling.delete(token);
      }
    }
    return filled;
  }

  private onAdapterControl(event: MarketEvent): void {
    if (event.type === 'error') {
      this.publish(event);
      return;
    }
    if (event.type !== 'connection') return;

    const { exchange, marketType, state } = event.payload;
    this.publish(event);
    const id = `${exchange}:${marketType}`;
    if (state === 'disconnected' || state === 'reconnecting') {
      this.needsRecover.add(id);
      return;
    }
    if (state === 'connected' && this.needsRecover.delete(id)) {
      this.track(
        this.recoverMarket(exchange, marketType).catch((error: unknown) => this.fail(error)),
      );
    }
  }

  private async recoverMarket(exchange: ExchangeId, marketType: MarketType): Promise<void> {
    const jobs = [...this.targets.values()].filter(
      (target) =>
        target.channel === 'kline' &&
        target.interval != null &&
        target.symbol.exchange === exchange &&
        target.symbol.marketType === marketType,
    );
    for (const target of jobs) {
      if (!target.interval) continue;
      if (!this.registry.isActive(klineSubscriptionKey(target.symbol.symbolId, target.interval))) {
        continue;
      }
      const gaps = this.klines.detectGaps(target.symbol.symbolId, target.interval);
      const last = this.klines.getLast(target.symbol.symbolId, target.interval, 1)[0];
      if (last) {
        const tail = gapSince(last, this.now());
        if (tail) gaps.push(tail);
      }
      if (gaps.length > 0) await this.repair(target.symbol, gaps, true);
    }
  }

  private async persistClosed(klines: readonly Kline[]): Promise<void> {
    if (!this.history) return;
    const closed = klines.filter((kline) => kline.closed);
    if (closed.length === 0) return;
    await this.history.write(closed);
  }

  private publish(event: MarketEvent, key?: string): void {
    if (this.closed) return;
    for (const listener of this.listeners) this.safe(listener, event);
    if (!key) return;
    for (const sub of this.subs.values()) {
      if (sub.key === key && sub.listener) this.safe(sub.listener, event);
    }
  }

  private safe(listener: MarketSink, event: MarketEvent): void {
    try {
      listener(event);
    } catch (error) {
      this.logger.error('listener.failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private touch(symbolId: string, receivedAt: number): void {
    const previous = this.lastReceivedAt.get(symbolId) ?? 0;
    if (receivedAt >= previous) this.lastReceivedAt.set(symbolId, receivedAt);
  }

  private track<T>(work: Promise<T>): Promise<T> {
    this.inflight.add(work);
    void work.finally(() => {
      this.inflight.delete(work);
    });
    return work;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('MarketDataEngine is closed');
  }

  private assertSymbol(symbol: MarketSymbol): void {
    const expected = buildSymbolId(symbol.exchange, symbol.marketType, symbol.base, symbol.quote);
    if (symbol.symbolId !== expected) {
      throw new Error(`symbolId mismatch: expected ${expected}, received ${symbol.symbolId}`);
    }
  }

  private fail(error: unknown, symbolId?: string): void {
    const payload = toMarketError(error, symbolId, this.now());
    this.logger.warn('market.error', {
      code: payload.code,
      message: payload.message,
      symbolId,
    });
    this.publish({ type: 'error', payload });
  }
}
