import { formatMarketPrice, parseSymbolId } from '@vexora/shared';
import type {
  KlineInterval,
  MarketType,
  OrderBookLevel,
  TradeTick,
  WatchlistItem,
} from '../types/terminal';

export function marketTypeLabel(marketType: MarketType): string {
  return marketType === 'spot' ? '现货' : '合约';
}

/** Binance list name: spot `BTC/USDT`, perpetual `BTCUSDT`. */
export function listedSymbol(item: Pick<WatchlistItem, 'symbol' | 'marketType'>): string {
  const [base, quote] = item.symbol.split('/');
  if (!base || !quote) return item.symbol;
  return item.marketType === 'spot' ? `${base}/${quote}` : `${base}${quote}`;
}

/** Binance list badge: spot `10x`/`5x` when margin is offered, perpetual `永续`. */
export function listedTag(
  item: Pick<WatchlistItem, 'symbol' | 'marketType' | 'marginLeverage'>,
  leverageByRaw: Readonly<Record<string, number>> = {},
): string | null {
  if (item.marketType !== 'spot') return '永续';
  const raw = item.symbol.replace('/', '').toUpperCase();
  const leverage = item.marginLeverage ?? leverageByRaw[raw];
  return leverage ? `${leverage}x` : null;
}

export const MARKET_TYPE_OPTIONS: Array<{ label: string; value: MarketType }> = [
  { label: '现货', value: 'spot' },
  { label: '合约', value: 'usdt_perpetual' },
];

export const INTERVAL_OPTIONS: Array<{ label: string; value: KlineInterval }> = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

/** Full searchable instrument catalog (mock). */
export const MARKET_INSTRUMENTS: WatchlistItem[] = [
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
    symbolId: 'binance:spot:BNB/USDT',
    symbol: 'BNB/USDT',
    marketType: 'spot',
    lastPrice: 612.4,
    changePercent: 0.37,
  },
  {
    symbolId: 'binance:spot:XRP/USDT',
    symbol: 'XRP/USDT',
    marketType: 'spot',
    lastPrice: 0.6421,
    changePercent: -1.15,
  },
  {
    symbolId: 'binance:spot:DOGE/USDT',
    symbol: 'DOGE/USDT',
    marketType: 'spot',
    lastPrice: 0.1584,
    changePercent: 4.02,
  },
  {
    symbolId: 'binance:spot:ADA/USDT',
    symbol: 'ADA/USDT',
    marketType: 'spot',
    lastPrice: 0.482,
    changePercent: 0.91,
  },
  {
    symbolId: 'binance:spot:AVAX/USDT',
    symbol: 'AVAX/USDT',
    marketType: 'spot',
    lastPrice: 36.84,
    changePercent: -2.44,
  },
  {
    symbolId: 'binance:spot:LINK/USDT',
    symbol: 'LINK/USDT',
    marketType: 'spot',
    lastPrice: 14.26,
    changePercent: 1.08,
  },
  {
    symbolId: 'binance:usdt_perpetual:BTC/USDT',
    symbol: 'BTC/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 67258.1,
    changePercent: 1.91,
  },
  {
    symbolId: 'binance:usdt_perpetual:ETH/USDT',
    symbol: 'ETH/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 3485.6,
    changePercent: -0.48,
  },
  {
    symbolId: 'binance:usdt_perpetual:SOL/USDT',
    symbol: 'SOL/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 178.55,
    changePercent: 3.05,
  },
  {
    symbolId: 'binance:usdt_perpetual:BNB/USDT',
    symbol: 'BNB/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 612.8,
    changePercent: 0.42,
  },
  {
    symbolId: 'binance:usdt_perpetual:XRP/USDT',
    symbol: 'XRP/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 0.6428,
    changePercent: -1.02,
  },
  {
    symbolId: 'binance:usdt_perpetual:DOGE/USDT',
    symbol: 'DOGE/USDT',
    marketType: 'usdt_perpetual',
    lastPrice: 0.1587,
    changePercent: 3.88,
  },
];

export const DEFAULT_WATCHLIST_IDS: string[] = [
  'binance:spot:BTC/USDT',
  'binance:spot:ETH/USDT',
  'binance:spot:SOL/USDT',
  'binance:spot:BNB/USDT',
  'binance:usdt_perpetual:BTC/USDT',
  'binance:usdt_perpetual:ETH/USDT',
];

/** @deprecated Prefer MARKET_INSTRUMENTS / resolveWatchlistItems */
export const WATCHLIST = MARKET_INSTRUMENTS;

export function watchlistItemFromSymbolId(symbolId: string): WatchlistItem | undefined {
  try {
    const parsed = parseSymbolId(symbolId);
    return {
      symbolId,
      symbol: `${parsed.base}/${parsed.quote}`,
      marketType: parsed.marketType,
      lastPrice: 0,
      changePercent: 0,
    };
  } catch {
    return undefined;
  }
}

export function getInstrument(symbolId: string): WatchlistItem | undefined {
  return (
    MARKET_INSTRUMENTS.find((item) => item.symbolId === symbolId) ??
    watchlistItemFromSymbolId(symbolId)
  );
}

export function resolveWatchlistItems(ids: string[]): WatchlistItem[] {
  return ids
    .map((id) => getInstrument(id))
    .filter((item): item is WatchlistItem => item != null);
}

export function searchInstruments(
  query: string,
  options?: { marketType?: MarketType; limit?: number; pool?: WatchlistItem[] },
): WatchlistItem[] {
  const normalized = query.trim().toLowerCase().replace(/[-_\s]/g, '');
  const limit = options?.limit ?? 8;
  const source = options?.pool ?? MARKET_INSTRUMENTS;
  const pool = options?.marketType
    ? source.filter((item) => item.marketType === options.marketType)
    : source;

  if (!normalized) {
    return pool.slice(0, limit);
  }

  return pool
    .filter((item) => {
      const symbol = item.symbol.toLowerCase().replace(/[-_\s]/g, '');
      const id = item.symbolId.toLowerCase();
      return symbol.includes(normalized) || id.includes(normalized);
    })
    .slice(0, limit);
}

export function toWatchlistItemFromInstrument(input: {
  symbolId: string;
  base: string;
  quote: string;
  marketType: MarketType;
  marginLeverage?: number;
}): WatchlistItem {
  return {
    symbolId: input.symbolId,
    symbol: `${input.base}/${input.quote}`,
    marketType: input.marketType,
    lastPrice: 0,
    changePercent: 0,
    ...(input.marginLeverage ? { marginLeverage: input.marginLeverage } : {}),
  };
}

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

/** UI price text — Binance-style subscripts for micro prices (e.g. 0.0₅487). */
export function formatPrice(value: number): string {
  return formatMarketPrice(value);
}

export interface QtyScale {
  divisor: number;
  suffix: string;
  decimals: number;
}

/**
 * Pick one size unit from the visible book magnitude.
 * BTC (max ~few coins) stays plain; meme coins (millions+) use K/M/B.
 */
export function qtyScaleForMax(maxQty: number): QtyScale {
  const abs = Math.abs(maxQty);
  if (!Number.isFinite(abs) || abs <= 0) {
    return { divisor: 1, suffix: '', decimals: 3 };
  }
  if (abs >= 1_000_000_000) return { divisor: 1_000_000_000, suffix: 'B', decimals: 2 };
  if (abs >= 1_000_000) return { divisor: 1_000_000, suffix: 'M', decimals: 2 };
  if (abs >= 100_000) return { divisor: 1_000, suffix: 'K', decimals: 2 };
  if (abs >= 100) return { divisor: 1, suffix: '', decimals: 2 };
  if (abs >= 1) return { divisor: 1, suffix: '', decimals: 3 };
  if (abs >= 0.001) return { divisor: 1, suffix: '', decimals: 4 };
  return { divisor: 1, suffix: '', decimals: 6 };
}

/** Format with an explicit scale so one book uses one unit. */
export function formatQtyWithScale(value: number, scale: QtyScale): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const scaled = Math.abs(value) / scale.divisor;
  if (scale.divisor === 1 && scaled > 0 && scaled < 0.001) {
    return `${sign}${scaled.toPrecision(3)}`;
  }
  return `${sign}${scaled.toFixed(scale.decimals)}${scale.suffix}`;
}

/** Standalone qty (trades etc.): infer scale from the value itself. */
export function formatQty(value: number): string {
  return formatQtyWithScale(value, qtyScaleForMax(Math.abs(value)));
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
