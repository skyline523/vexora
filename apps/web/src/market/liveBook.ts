import { useEffect } from 'react';
import { create } from 'zustand';
import type { OrderBookSnapshot, Trade } from '@vexora/shared';
import { marketWebSocketUrl } from '../api/market';

const MAX_TRADES = 40;
const BOOK_LEVELS = 20;

interface LiveBookState {
  symbolId: string | null;
  book: OrderBookSnapshot | null;
  trades: Trade[];
  setSymbol: (symbolId: string) => void;
  applyBook: (book: OrderBookSnapshot) => void;
  applyTrade: (trade: Trade) => void;
  clear: () => void;
}

function trimBook(book: OrderBookSnapshot): OrderBookSnapshot {
  return {
    ...book,
    bids: book.bids.slice(0, BOOK_LEVELS),
    asks: book.asks.slice(0, BOOK_LEVELS),
  };
}

export const useLiveBookStore = create<LiveBookState>((set) => ({
  symbolId: null,
  book: null,
  trades: [],
  setSymbol: (symbolId) => {
    set((state) =>
      state.symbolId === symbolId
        ? state
        : { symbolId, book: null, trades: [] },
    );
  },
  applyBook: (book) => {
    set((state) => {
      if (state.symbolId && book.symbolId !== state.symbolId) return state;
      return { book: trimBook(book) };
    });
  },
  applyTrade: (trade) => {
    set((state) => {
      if (state.symbolId && trade.symbolId !== state.symbolId) return state;
      if (state.trades.some((row) => row.tradeId === trade.tradeId)) return state;
      const trades = [...state.trades, trade]
        .sort((a, b) => a.ts - b.ts || a.tradeId.localeCompare(b.tradeId))
        .slice(-MAX_TRADES);
      return { trades };
    });
  },
  clear: () => set({ book: null, trades: [], symbolId: null }),
}));

function isTrade(value: unknown): value is Trade {
  if (!value || typeof value !== 'object') return false;
  const trade = value as Partial<Trade>;
  return (
    typeof trade.symbolId === 'string' &&
    typeof trade.tradeId === 'string' &&
    typeof trade.price === 'number' &&
    typeof trade.qty === 'number'
  );
}

function isOrderBook(value: unknown): value is OrderBookSnapshot {
  if (!value || typeof value !== 'object') return false;
  const book = value as Partial<OrderBookSnapshot>;
  return (
    typeof book.symbolId === 'string' &&
    Array.isArray(book.bids) &&
    Array.isArray(book.asks)
  );
}

interface FeedHandle {
  symbolId: string;
  refs: number;
  close: () => void;
}

let activeFeed: FeedHandle | null = null;

function openFeed(symbolId: string): () => void {
  if (activeFeed?.symbolId === symbolId) {
    activeFeed.refs += 1;
    return () => releaseFeed(symbolId);
  }
  activeFeed?.close();
  activeFeed = null;

  useLiveBookStore.getState().setSymbol(symbolId);

  let closed = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const connect = (): void => {
    const ws = new WebSocket(marketWebSocketUrl());
    socket = ws;
    ws.onopen = () => {
      if (closed) return;
      attempt = 0;
      const request = (channel: 'trade' | 'orderbook') => {
        ws.send(
          JSON.stringify({
            type: 'market.subscribe',
            requestId: crypto.randomUUID(),
            payload: { channel, symbolId },
          }),
        );
      };
      request('orderbook');
      request('trade');
    };
    ws.onmessage = (event) => {
      let message: { type?: string; payload?: unknown };
      try {
        message = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
      } catch {
        return;
      }
      if (message.type === 'market.orderbook' && isOrderBook(message.payload)) {
        useLiveBookStore.getState().applyBook(message.payload);
        return;
      }
      if (message.type === 'market.trade' && isTrade(message.payload)) {
        useLiveBookStore.getState().applyTrade(message.payload);
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(10_000, 1000 * 2 ** attempt);
      attempt += 1;
      retry = setTimeout(connect, delay);
    };
  };

  connect();

  const handle: FeedHandle = {
    symbolId,
    refs: 1,
    close: () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
  activeFeed = handle;
  return () => releaseFeed(symbolId);
}

function releaseFeed(symbolId: string): void {
  if (!activeFeed || activeFeed.symbolId !== symbolId) return;
  activeFeed.refs -= 1;
  if (activeFeed.refs > 0) return;
  activeFeed.close();
  activeFeed = null;
}

/** Shared WS for the active symbol's order book + recent trades. */
export function useLiveMarketFeed(symbolId: string): void {
  useEffect(() => openFeed(symbolId), [symbolId]);
}

export function formatTradeTime(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function withCumulativeTotals(
  levels: Array<{ price: number; qty: number }>,
): Array<{ price: number; qty: number; total: number }> {
  let total = 0;
  return levels.map((level) => {
    total += level.qty;
    return { price: level.price, qty: level.qty, total };
  });
}

export const BOOK_TICK_OPTIONS = [0.01, 0.1, 1, 10] as const;
export type BookTick = (typeof BOOK_TICK_OPTIONS)[number];
export const BOOK_SIDE_LEVELS = 7;

function bucketPrice(price: number, tick: number, side: 'bid' | 'ask'): number {
  const scaled = price / tick;
  const bucket = side === 'bid' ? Math.floor(scaled) * tick : Math.ceil(scaled) * tick;
  // Avoid float dust (e.g. 0.1 * 3 → 0.30000000000000004).
  const decimals = tickDecimals(tick);
  return Number(bucket.toFixed(decimals));
}

export function tickDecimals(tick: number): number {
  if (tick >= 1) return 0;
  const text = String(tick);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

export function formatBookPrice(price: number, tick: number): string {
  const decimals = tickDecimals(tick);
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Group raw levels by tick size and keep the best `limit` buckets. */
export function aggregateBookLevels(
  levels: Array<{ price: number; qty: number }>,
  tick: number,
  side: 'bid' | 'ask',
  limit: number,
): Array<{ price: number; qty: number }> {
  const buckets = new Map<number, number>();
  for (const level of levels) {
    const price = bucketPrice(level.price, tick, side);
    buckets.set(price, (buckets.get(price) ?? 0) + level.qty);
  }
  const sorted = [...buckets.entries()]
    .map(([price, qty]) => ({ price, qty }))
    .sort((left, right) =>
      side === 'bid' ? right.price - left.price : left.price - right.price,
    );
  return sorted.slice(0, limit);
}
