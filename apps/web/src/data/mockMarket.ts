import type {
  KlineInterval,
  MarketType,
  OrderBookLevel,
  TradeTick,
  WatchlistItem,
} from '../types/terminal';

export const MARKET_TYPE_OPTIONS: Array<{ label: string; value: MarketType }> = [
  { label: 'Spot', value: 'spot' },
  { label: 'USDT-M', value: 'usdt_perpetual' },
];

export const INTERVAL_OPTIONS: Array<{ label: string; value: KlineInterval }> = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

export const WATCHLIST: WatchlistItem[] = [
  {
    symbolId: 'binance:spot:BTC/USDT',
    symbol: 'BTC/USDT',
    marketType: 'spot',
    lastPrice: 67245.3,
    changePercent: 1.84,
  },
  {
    symbolId: 'binance:spot:ETH/USDT',
    symbol: 'ETH/USDT',
    marketType: 'spot',
    lastPrice: 3482.15,
    changePercent: -0.62,
  },
  {
    symbolId: 'binance:spot:SOL/USDT',
    symbol: 'SOL/USDT',
    marketType: 'spot',
    lastPrice: 178.42,
    changePercent: 3.21,
  },
  {
    symbolId: 'binance:usdt_perpetual:BTCUSDT',
    symbol: 'BTCUSDT',
    marketType: 'usdt_perpetual',
    lastPrice: 67258.1,
    changePercent: 1.91,
  },
  {
    symbolId: 'binance:usdt_perpetual:ETHUSDT',
    symbol: 'ETHUSDT',
    marketType: 'usdt_perpetual',
    lastPrice: 3485.6,
    changePercent: -0.48,
  },
  {
    symbolId: 'binance:spot:BNB/USDT',
    symbol: 'BNB/USDT',
    marketType: 'spot',
    lastPrice: 612.4,
    changePercent: 0.37,
  },
];

export function buildOrderBook(mid: number): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < 14; i += 1) {
    bids.push({
      price: mid - (i + 1) * (mid * 0.00012),
      quantity: 0.12 + i * 0.07 + ((i * 13) % 5) * 0.04,
    });
    asks.push({
      price: mid + (i + 1) * (mid * 0.00012),
      quantity: 0.1 + i * 0.06 + ((i * 11) % 4) * 0.05,
    });
  }

  return { bids, asks };
}

export function buildTrades(mid: number): TradeTick[] {
  const sides: Array<'buy' | 'sell'> = ['buy', 'sell', 'buy', 'buy', 'sell', 'sell', 'buy'];
  return sides.map((side, index) => {
    const delta = ((index % 3) - 1) * mid * 0.00008;
    const minute = String(42 - index).padStart(2, '0');
    return {
      id: `t-${index}`,
      price: mid + delta,
      quantity: 0.015 + index * 0.008,
      side,
      time: `14:${minute}:1${index}`,
    };
  });
}

export function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatQty(value: number): string {
  return value.toFixed(3);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
