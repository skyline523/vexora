export type ExchangeId = 'binance';

export type MarketType = 'spot' | 'usdt_perpetual';

export type KlineInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '1w';

export const KLINE_INTERVALS: readonly KlineInterval[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '1w',
] as const;

/** Unified market symbol. symbolId format: `{exchange}:{marketType}:{BASE}/{QUOTE}` */
export interface MarketSymbol {
  exchange: ExchangeId;
  marketType: MarketType;
  /** Normalized base, e.g. BTC */
  base: string;
  /** Normalized quote, e.g. USDT */
  quote: string;
  /** Exchange raw symbol, e.g. BTCUSDT */
  rawSymbol: string;
  /** Stable unique key, e.g. binance:spot:BTC/USDT */
  symbolId: string;
}

export interface Ticker {
  symbolId: string;
  exchange: ExchangeId;
  marketType: MarketType;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  quoteVolume24h?: number;
  priceChangePercent24h?: number;
  /** Exchange event time, UTC ms */
  ts: number;
  /** Local receive time, UTC ms */
  receivedAt: number;
}

export interface Kline {
  symbolId: string;
  interval: KlineInterval;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
  /** true = candle closed/confirmed */
  closed: boolean;
  ts: number;
  receivedAt: number;
}

export interface Trade {
  symbolId: string;
  tradeId: string;
  price: number;
  qty: number;
  quoteQty?: number;
  side: 'buy' | 'sell' | 'unknown';
  ts: number;
  receivedAt: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBookSnapshot {
  symbolId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ts: number;
  receivedAt: number;
  sequence?: string;
}

export interface OrderBookDelta {
  symbolId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ts: number;
  receivedAt: number;
  sequence?: string;
  prevSequence?: string;
}

export interface ConnectionStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  channel: string;
  state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  ts: number;
}

export interface GapInfo {
  symbolId: string;
  interval: KlineInterval;
  fromOpenTime: number;
  toOpenTime: number;
}

export interface MarketError {
  code: string;
  message: string;
  exchange?: ExchangeId;
  symbolId?: string;
  retryable: boolean;
  ts: number;
}

export type MarketEvent =
  | { type: 'ticker'; payload: Ticker }
  | { type: 'kline'; payload: Kline }
  | { type: 'trade'; payload: Trade }
  | { type: 'orderbook_snapshot'; payload: OrderBookSnapshot }
  | { type: 'orderbook_delta'; payload: OrderBookDelta }
  | { type: 'connection'; payload: ConnectionStatus }
  | { type: 'gap_detected'; payload: GapInfo }
  | { type: 'error'; payload: MarketError };

export interface ExchangeInstrument {
  symbol: MarketSymbol;
  pricePrecision: number;
  quantityPrecision: number;
  status: 'trading' | 'break' | 'unknown';
  contractType?: 'usdt_perpetual';
}

export interface ExchangeInfo {
  exchange: ExchangeId;
  marketType: MarketType;
  timezone?: string;
  serverTime?: number;
  instruments: ExchangeInstrument[];
}

export interface GetKlinesParams {
  symbol: MarketSymbol;
  interval: KlineInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export type MarketSink = (event: MarketEvent) => void;

export interface Subscription {
  unsubscribe(): void;
}

export interface ExchangeAdapter {
  readonly id: ExchangeId;

  getExchangeInfo(marketType: MarketType): Promise<ExchangeInfo>;
  getTicker(symbol: MarketSymbol): Promise<Ticker>;
  getKlines(params: GetKlinesParams): Promise<Kline[]>;
  getOrderBookSnapshot(
    symbol: MarketSymbol,
    depth?: number,
  ): Promise<OrderBookSnapshot>;

  subscribeKlines(
    symbol: MarketSymbol,
    interval: KlineInterval,
    sink: MarketSink,
  ): Subscription;
  subscribeTrades(symbol: MarketSymbol, sink: MarketSink): Subscription;
  subscribeOrderBook?(symbol: MarketSymbol, sink: MarketSink): Subscription;

  disconnect(): Promise<void>;
}
