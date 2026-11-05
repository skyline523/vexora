import {
  createMarketSymbol,
  type ExchangeInstrument,
  type Kline,
  type KlineInterval,
  type MarketSymbol,
  type MarketType,
  type OrderBookSnapshot,
  type Ticker,
  type Trade,
} from '@vexora/shared';
import { BINANCE_EXCHANGE_ID } from './constants';

export interface RawExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  contractType?: string;
  filters?: Array<Record<string, string>>;
  pricePrecision?: number;
  quantityPrecision?: number;
}

export interface RawExchangeInfo {
  timezone?: string;
  serverTime?: number;
  symbols: RawExchangeInfoSymbol[];
}

export type RawKline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteVolume
  number, // tradeCount
  string, // takerBuyBase
  string, // takerBuyQuote
  string, // ignore
];

export interface RawTicker24hr {
  symbol: string;
  lastPrice: string;
  bidPrice?: string;
  askPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: string;
  quoteVolume?: string;
  priceChangePercent?: string;
  closeTime?: number;
}

export interface RawDepth {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
  E?: number;
  T?: number;
}

export interface RawWsKlineEvent {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    n: number;
    x: boolean;
    q: string;
  };
}

export interface RawWsTradeEvent {
  e: 'trade';
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
}

function toNumber(value: string | number | undefined, fallback = 0): number {
  if (value == null) {
    return fallback;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function precisionFromFilter(
  filters: Array<Record<string, string>> | undefined,
  filterType: string,
  tickKey: string,
): number | undefined {
  const filter = filters?.find((f) => f.filterType === filterType);
  const tick = filter?.[tickKey];
  if (!tick) {
    return undefined;
  }
  const normalized = tick.includes('.') ? tick.replace(/0+$/, '').replace(/\.$/, '') : tick;
  const dot = normalized.indexOf('.');
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

function mapStatus(status: string): ExchangeInstrument['status'] {
  const upper = status.toUpperCase();
  if (upper === 'TRADING') {
    return 'trading';
  }
  if (upper === 'BREAK') {
    return 'break';
  }
  return 'unknown';
}

export function mapInstrument(
  raw: RawExchangeInfoSymbol,
  marketType: MarketType,
): ExchangeInstrument | null {
  if (marketType === 'usdt_perpetual') {
    const contract = (raw.contractType ?? '').toUpperCase();
    if (contract && contract !== 'PERPETUAL') {
      return null;
    }
  }

  const symbol = createMarketSymbol({
    exchange: BINANCE_EXCHANGE_ID,
    marketType,
    base: raw.baseAsset,
    quote: raw.quoteAsset,
    rawSymbol: raw.symbol,
  });

  const pricePrecision =
    precisionFromFilter(raw.filters, 'PRICE_FILTER', 'tickSize') ??
    raw.pricePrecision ??
    8;
  const quantityPrecision =
    precisionFromFilter(raw.filters, 'LOT_SIZE', 'stepSize') ??
    raw.quantityPrecision ??
    8;

  return {
    symbol,
    pricePrecision,
    quantityPrecision,
    status: mapStatus(raw.status),
    ...(marketType === 'usdt_perpetual' ? { contractType: 'usdt_perpetual' as const } : {}),
  };
}

export function mapTicker(
  raw: RawTicker24hr,
  symbol: MarketSymbol,
  receivedAt = Date.now(),
): Ticker {
  return {
    symbolId: symbol.symbolId,
    exchange: symbol.exchange,
    marketType: symbol.marketType,
    lastPrice: toNumber(raw.lastPrice),
    bidPrice: raw.bidPrice != null ? toNumber(raw.bidPrice) : undefined,
    askPrice: raw.askPrice != null ? toNumber(raw.askPrice) : undefined,
    high24h: raw.highPrice != null ? toNumber(raw.highPrice) : undefined,
    low24h: raw.lowPrice != null ? toNumber(raw.lowPrice) : undefined,
    volume24h: raw.volume != null ? toNumber(raw.volume) : undefined,
    quoteVolume24h: raw.quoteVolume != null ? toNumber(raw.quoteVolume) : undefined,
    priceChangePercent24h:
      raw.priceChangePercent != null ? toNumber(raw.priceChangePercent) : undefined,
    ts: raw.closeTime ?? receivedAt,
    receivedAt,
  };
}

export function mapRestKline(
  raw: RawKline,
  symbol: MarketSymbol,
  interval: KlineInterval,
  receivedAt = Date.now(),
): Kline {
  const closeTime = raw[6];
  const closed = closeTime < receivedAt;
  return {
    symbolId: symbol.symbolId,
    interval,
    openTime: raw[0],
    closeTime,
    open: toNumber(raw[1]),
    high: toNumber(raw[2]),
    low: toNumber(raw[3]),
    close: toNumber(raw[4]),
    volume: toNumber(raw[5]),
    quoteVolume: toNumber(raw[7]),
    tradeCount: raw[8],
    closed,
    ts: closeTime,
    receivedAt,
  };
}

export function mapWsKline(
  event: RawWsKlineEvent,
  symbol: MarketSymbol,
  interval: KlineInterval,
  receivedAt = Date.now(),
): Kline {
  const k = event.k;
  return {
    symbolId: symbol.symbolId,
    interval,
    openTime: k.t,
    closeTime: k.T,
    open: toNumber(k.o),
    high: toNumber(k.h),
    low: toNumber(k.l),
    close: toNumber(k.c),
    volume: toNumber(k.v),
    quoteVolume: toNumber(k.q),
    tradeCount: k.n,
    closed: k.x,
    ts: event.E,
    receivedAt,
  };
}

export function mapWsTrade(
  event: RawWsTradeEvent,
  symbol: MarketSymbol,
  receivedAt = Date.now(),
): Trade {
  return {
    symbolId: symbol.symbolId,
    tradeId: String(event.t),
    price: toNumber(event.p),
    qty: toNumber(event.q),
    quoteQty: toNumber(event.p) * toNumber(event.q),
    // m=true means buyer is market maker => seller aggressor => sell
    side: event.m ? 'sell' : 'buy',
    ts: event.T,
    receivedAt,
  };
}

export function mapOrderBook(
  raw: RawDepth,
  symbol: MarketSymbol,
  receivedAt = Date.now(),
): OrderBookSnapshot {
  return {
    symbolId: symbol.symbolId,
    bids: raw.bids.map(([price, qty]) => ({
      price: toNumber(price),
      qty: toNumber(qty),
    })),
    asks: raw.asks.map(([price, qty]) => ({
      price: toNumber(price),
      qty: toNumber(qty),
    })),
    ts: raw.E ?? raw.T ?? receivedAt,
    receivedAt,
    sequence: String(raw.lastUpdateId),
  };
}

export function streamNameForKline(rawSymbol: string, interval: KlineInterval): string {
  return `${rawSymbol.toLowerCase()}@kline_${interval}`;
}

export function streamNameForTrade(rawSymbol: string): string {
  return `${rawSymbol.toLowerCase()}@trade`;
}
