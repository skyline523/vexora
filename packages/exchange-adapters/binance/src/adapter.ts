import {
  createLogger,
  type ExchangeAdapter,
  type ExchangeInfo,
  type GetKlinesParams,
  type Kline,
  type KlineInterval,
  type Logger,
  type MarketSink,
  type MarketSymbol,
  type MarketType,
  type OrderBookSnapshot,
  type Subscription,
  type Ticker,
} from '@vexora/shared';
import { BINANCE_EXCHANGE_ID } from './constants';
import {
  mapInstrument,
  mapOrderBook,
  mapRestKline,
  mapTicker,
  mapWsKline,
  mapWsTicker,
  mapWsTrade,
  streamNameForKline,
  streamNameForTicker,
  streamNameForTrade,
  type RawDepth,
  type RawExchangeInfo,
  type RawKline,
  type RawTicker24hr,
  type RawWsKlineEvent,
  type RawWsTickerEvent,
  type RawWsTradeEvent,
} from './mappers';
import { resolveProxyUrl, resolveProxyUrlAsync } from './proxy';
import { BinanceRestClient, type RestClientOptions } from './rest-client';
import {
  BinanceWsManager,
  type BinanceWsManagerOptions,
} from './ws-manager';

export interface BinanceAdapterOptions {
  rest?: RestClientOptions;
  ws?: BinanceWsManagerOptions;
  logger?: Logger;
  /** Shared sink for connection/error events from WS manager. */
  eventSink?: MarketSink;
  /**
   * Optional HTTP(S) proxy. Leave unset for Clash TUN, global VPN, and production.
   * Set only when this process must egress through an HTTP proxy.
   */
  proxyUrl?: string;
}

/** Builds an adapter. Proxy is used only when explicitly configured. */
export async function createBinanceAdapter(
  options: BinanceAdapterOptions = {},
): Promise<BinanceAdapter> {
  const proxyUrl =
    options.proxyUrl ??
    options.rest?.proxyUrl ??
    options.ws?.proxyUrl ??
    (await resolveProxyUrlAsync());
  return new BinanceAdapter({ ...options, proxyUrl });
}

function assertBinanceSymbol(symbol: MarketSymbol): void {
  if (symbol.exchange !== BINANCE_EXCHANGE_ID) {
    throw new Error(`Expected binance symbol, got ${symbol.exchange}`);
  }
}

function depthWeight(limit: number): number {
  if (limit <= 100) return 5;
  if (limit <= 500) return 25;
  if (limit <= 1000) return 50;
  return 250;
}

export class BinanceAdapter implements ExchangeAdapter {
  readonly id = BINANCE_EXCHANGE_ID;

  private readonly rest: BinanceRestClient;
  private readonly ws: BinanceWsManager;
  private readonly logger: Logger;

  constructor(options: BinanceAdapterOptions = {}) {
    this.logger =
      options.logger ?? createLogger('binance-adapter', { level: 'info' });
    const proxyUrl =
      options.proxyUrl ??
      options.rest?.proxyUrl ??
      options.ws?.proxyUrl ??
      resolveProxyUrl();
    if (proxyUrl) {
      this.logger.info('proxy.enabled', { proxyUrl });
    } else {
      this.logger.info('network.direct');
    }
    this.rest = new BinanceRestClient({
      ...options.rest,
      proxyUrl: options.rest?.proxyUrl ?? proxyUrl,
      logger: options.rest?.logger ?? this.logger.child({ layer: 'rest' }),
    });
    this.ws = new BinanceWsManager({
      ...options.ws,
      proxyUrl: options.ws?.proxyUrl ?? proxyUrl,
      logger: options.ws?.logger ?? this.logger.child({ layer: 'ws' }),
      sink: options.eventSink ?? options.ws?.sink,
    });
  }

  setEventSink(sink: MarketSink | undefined): void {
    this.ws.setSink(sink);
  }

  async getExchangeInfo(marketType: MarketType): Promise<ExchangeInfo> {
    const path =
      marketType === 'spot' ? '/api/v3/exchangeInfo' : '/fapi/v1/exchangeInfo';
    // Spot exchangeInfo weight is 20; futures is 1
    const weight = marketType === 'spot' ? 20 : 1;
    const raw = await this.rest.getJson<RawExchangeInfo>(
      marketType,
      path,
      undefined,
      weight,
    );

    const instruments = raw.symbols
      .map((item) => mapInstrument(item, marketType))
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      exchange: BINANCE_EXCHANGE_ID,
      marketType,
      timezone: raw.timezone,
      serverTime: raw.serverTime,
      instruments,
    };
  }

  async getTicker(symbol: MarketSymbol): Promise<Ticker> {
    assertBinanceSymbol(symbol);
    const path =
      symbol.marketType === 'spot'
        ? '/api/v3/ticker/24hr'
        : '/fapi/v1/ticker/24hr';
    const raw = await this.rest.getJson<RawTicker24hr>(
      symbol.marketType,
      path,
      { symbol: symbol.rawSymbol },
      2,
    );
    return mapTicker(raw, symbol);
  }

  async getKlines(params: GetKlinesParams): Promise<Kline[]> {
    assertBinanceSymbol(params.symbol);
    const path =
      params.symbol.marketType === 'spot'
        ? '/api/v3/klines'
        : '/fapi/v1/klines';
    const limit = Math.min(Math.max(params.limit ?? 500, 1), 1500);
    const raw = await this.rest.getJson<RawKline[]>(
      params.symbol.marketType,
      path,
      {
        symbol: params.symbol.rawSymbol,
        interval: params.interval,
        startTime: params.startTime,
        endTime: params.endTime,
        limit,
      },
      2,
    );
    const receivedAt = Date.now();
    return raw.map((row) =>
      mapRestKline(row, params.symbol, params.interval, receivedAt),
    );
  }

  async getOrderBookSnapshot(
    symbol: MarketSymbol,
    depth = 100,
  ): Promise<OrderBookSnapshot> {
    assertBinanceSymbol(symbol);
    const limit = Math.min(Math.max(depth, 1), 5000);
    const path =
      symbol.marketType === 'spot' ? '/api/v3/depth' : '/fapi/v1/depth';
    const raw = await this.rest.getJson<RawDepth>(
      symbol.marketType,
      path,
      { symbol: symbol.rawSymbol, limit },
      depthWeight(limit),
    );
    return mapOrderBook(raw, symbol);
  }

  subscribeKlines(
    symbol: MarketSymbol,
    interval: KlineInterval,
    sink: MarketSink,
  ): Subscription {
    assertBinanceSymbol(symbol);
    const stream = streamNameForKline(symbol.rawSymbol, interval);
    const unsubscribe = this.ws.subscribe(
      symbol.marketType,
      stream,
      (payload) => {
        const event = payload as RawWsKlineEvent;
        if (!event || event.e !== 'kline' || !event.k) {
          return;
        }
        sink({
          type: 'kline',
          payload: mapWsKline(event, symbol, interval),
        });
      },
    );
    return { unsubscribe };
  }

  subscribeTicker(symbol: MarketSymbol, sink: MarketSink): Subscription {
    assertBinanceSymbol(symbol);
    const stream = streamNameForTicker(symbol.rawSymbol);
    const unsubscribe = this.ws.subscribe(symbol.marketType, stream, (payload) => {
      const event = payload as RawWsTickerEvent;
      if (!event || event.e !== '24hrTicker') return;
      sink({
        type: 'ticker',
        payload: mapWsTicker(event, symbol),
      });
    });
    return { unsubscribe };
  }

  subscribeTrades(symbol: MarketSymbol, sink: MarketSink): Subscription {
    assertBinanceSymbol(symbol);
    const stream = streamNameForTrade(symbol.rawSymbol);
    const unsubscribe = this.ws.subscribe(
      symbol.marketType,
      stream,
      (payload) => {
        const event = payload as RawWsTradeEvent;
        if (!event || event.e !== 'trade') {
          return;
        }
        sink({
          type: 'trade',
          payload: mapWsTrade(event, symbol),
        });
      },
    );
    return { unsubscribe };
  }

  async disconnect(): Promise<void> {
    await this.ws.disconnect();
  }
}
