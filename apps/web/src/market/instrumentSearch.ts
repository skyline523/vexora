import { useEffect, useMemo, useState } from 'react';
import { fetchInstruments } from '../api/market';
import {
  searchInstruments,
  toWatchlistItemFromInstrument,
} from '../data/mockMarket';
import type { MarketType, WatchlistItem } from '../types/terminal';

interface UseInstrumentSearchOptions {
  query: string;
  limit?: number;
  enabled?: boolean;
}

interface InstrumentSearchState {
  results: WatchlistItem[];
  loading: boolean;
  error: string | null;
}

function mapInstruments(
  instruments: Awaited<ReturnType<typeof fetchInstruments>>,
): WatchlistItem[] {
  return instruments.map((item) =>
    toWatchlistItemFromInstrument({
      symbolId: item.symbol.symbolId,
      base: item.symbol.base,
      quote: item.symbol.quote,
      marketType: item.symbol.marketType,
      marginLeverage: item.marginLeverage,
    }),
  );
}

/** Interleave Spot + Perp like Binance: same base often appears as a pair. */
export function mergeMarketSearchResults(
  spot: WatchlistItem[],
  perp: WatchlistItem[],
  limit: number,
): WatchlistItem[] {
  const out: WatchlistItem[] = [];
  const seen = new Set<string>();
  const perpByBase = new Map<string, WatchlistItem>();
  for (const item of perp) {
    const base = item.symbol.split('/')[0]?.toUpperCase();
    if (base && !perpByBase.has(base)) perpByBase.set(base, item);
  }

  const push = (item: WatchlistItem | undefined): void => {
    if (!item || seen.has(item.symbolId) || out.length >= limit) return;
    seen.add(item.symbolId);
    out.push(item);
  };

  for (const spotItem of spot) {
    push(spotItem);
    const base = spotItem.symbol.split('/')[0]?.toUpperCase();
    if (base) push(perpByBase.get(base));
    if (out.length >= limit) break;
  }

  for (const perpItem of perp) {
    push(perpItem);
    if (out.length >= limit) break;
  }

  return out;
}

/** Debounced Binance-style search across Spot + USDT-M perpetual. */
export function useInstrumentSearch(options: UseInstrumentSearchOptions): InstrumentSearchState {
  const { query, limit = 12, enabled = true } = options;
  const [remote, setRemote] = useState<WatchlistItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const perMarket = Math.max(6, Math.ceil(limit / 2) + 2);
    const q = debouncedQuery.trim() || undefined;

    void Promise.allSettled([
      fetchInstruments({ marketType: 'spot', q, quote: 'USDT', limit: perMarket }),
      fetchInstruments({
        marketType: 'usdt_perpetual',
        q,
        quote: 'USDT',
        limit: perMarket,
      }),
    ])
      .then(([spotResult, perpResult]) => {
        if (cancelled) return;
        const spotItems =
          spotResult.status === 'fulfilled'
            ? mapInstruments(spotResult.value)
            : searchInstruments(debouncedQuery, { marketType: 'spot', limit: perMarket });
        const perpItems =
          perpResult.status === 'fulfilled'
            ? mapInstruments(perpResult.value)
            : searchInstruments(debouncedQuery, {
                marketType: 'usdt_perpetual',
                limit: perMarket,
              });
        setRemote(mergeMarketSearchResults(spotItems, perpItems, limit));
        if (spotResult.status === 'rejected' && perpResult.status === 'rejected') {
          setError('行情搜索暂不可用，先显示常用币种');
          return;
        }
        setError(
          perpResult.status === 'rejected'
            ? '合约行情暂不可用，已显示常用合约'
            : spotResult.status === 'rejected'
              ? '现货行情暂不可用'
              : null,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, enabled, limit]);

  const fallback = useMemo(() => {
    const spot = searchInstruments(debouncedQuery, { marketType: 'spot', limit });
    const perp = searchInstruments(debouncedQuery, {
      marketType: 'usdt_perpetual',
      limit,
    });
    return mergeMarketSearchResults(spot, perp, limit);
  }, [debouncedQuery, limit]);

  return {
    results: remote ?? fallback,
    loading,
    error,
  };
}

export type { MarketType };
