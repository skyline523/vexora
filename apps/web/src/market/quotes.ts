import { useEffect } from 'react';
import { create } from 'zustand';
import type { Ticker } from '@vexora/shared';
import { fetchTickers, marketWebSocketUrl } from '../api/market';

export interface LiveQuote {
  lastPrice: number;
  changePercent?: number;
}

interface QuoteState {
  quotes: Record<string, LiveQuote>;
  applyTicker: (ticker: Ticker) => void;
  applyLastPrice: (symbolId: string, lastPrice: number) => void;
}

export const useQuoteStore = create<QuoteState>((set) => ({
  quotes: {},
  applyTicker: (ticker) => {
    set((state) => ({
      quotes: {
        ...state.quotes,
        [ticker.symbolId]: {
          lastPrice: ticker.lastPrice,
          changePercent: ticker.priceChangePercent24h,
        },
      },
    }));
  },
  applyLastPrice: (symbolId, lastPrice) => {
    set((state) => ({
      quotes: {
        ...state.quotes,
        [symbolId]: {
          ...state.quotes[symbolId],
          lastPrice,
        },
      },
    }));
  },
}));

function isTicker(value: unknown): value is Ticker {
  if (!value || typeof value !== 'object') return false;
  const ticker = value as Partial<Ticker>;
  return typeof ticker.symbolId === 'string' && typeof ticker.lastPrice === 'number';
}

/** REST snapshot so search/watchlist rows show a price before the first WS tick. */
export function useHydrateQuotes(symbolIds: readonly string[]): void {
  const key = [...symbolIds].sort().join('|');

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) return undefined;

    let cancelled = false;
    void fetchTickers(ids)
      .then((tickers) => {
        if (cancelled) return;
        const apply = useQuoteStore.getState().applyTicker;
        for (const ticker of tickers) {
          apply(ticker);
        }
      })
      .catch(() => {
        // WS subscription below still provides live updates when available.
      });

    return () => {
      cancelled = true;
    };
  }, [key]);
}

/** Keep one socket for the visible symbols and publish last price plus 24h change. */
export function useWatchlistQuotes(symbolIds: readonly string[]): void {
  const key = [...symbolIds].sort().join('|');

  useHydrateQuotes(symbolIds);

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) return undefined;

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
        for (const symbolId of ids) {
          ws.send(
            JSON.stringify({
              type: 'market.subscribe',
              requestId: crypto.randomUUID(),
              payload: { channel: 'ticker', symbolId },
            }),
          );
        }
      };
      ws.onmessage = (event) => {
        let message: { type?: string; payload?: unknown };
        try {
          message = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
        } catch {
          return;
        }
        if (message.type === 'market.ticker' && isTicker(message.payload)) {
          useQuoteStore.getState().applyTicker(message.payload);
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
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [key]);
}
