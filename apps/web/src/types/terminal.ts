export type MarketType = 'spot' | 'usdt_perpetual';

export type KlineInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface WatchlistItem {
  symbolId: string;
  symbol: string;
  marketType: MarketType;
  lastPrice: number;
  changePercent: number;
  /** Spot cross-margin multiple from Binance, when the pair supports margin. */
  marginLeverage?: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface TradeTick {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  time: string;
}
