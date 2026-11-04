import { create } from 'zustand';
import {
  DEFAULT_WATCHLIST_IDS,
  getInstrument,
  resolveWatchlistItems,
} from '../data/mockMarket';
import type { KlineInterval, MarketType } from '../types/terminal';

const LAYOUT_STORAGE_KEY = 'vexora.terminal.layout.v1';
const WATCHLIST_STORAGE_KEY = 'vexora.terminal.watchlist.v1';

export interface LayoutWidths {
  watchlist: number;
  ai: number;
  bottom: number;
}

interface TerminalState {
  marketType: MarketType;
  symbolId: string;
  interval: KlineInterval;
  layout: LayoutWidths;
  watchlistIds: string[];
  setMarketType: (marketType: MarketType) => void;
  setSymbolId: (symbolId: string) => void;
  setInterval: (interval: KlineInterval) => void;
  setLayout: (patch: Partial<LayoutWidths>) => void;
  addToWatchlist: (symbolId: string) => void;
  removeFromWatchlist: (symbolId: string) => void;
}

function loadLayout(): LayoutWidths {
  const fallback: LayoutWidths = {
    watchlist: 240,
    ai: 320,
    bottom: 220,
  };

  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<LayoutWidths>;
    return {
      watchlist: clamp(parsed.watchlist ?? fallback.watchlist, 180, 420),
      ai: clamp(parsed.ai ?? fallback.ai, 240, 480),
      bottom: clamp(parsed.bottom ?? fallback.bottom, 160, 360),
    };
  } catch {
    return fallback;
  }
}

function loadWatchlistIds(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_WATCHLIST_IDS];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_WATCHLIST_IDS];
    }
    const ids = parsed.filter((id): id is string => typeof id === 'string' && Boolean(getInstrument(id)));
    return ids.length > 0 ? ids : [...DEFAULT_WATCHLIST_IDS];
  } catch {
    return [...DEFAULT_WATCHLIST_IDS];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persistLayout(layout: LayoutWidths): void {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function persistWatchlist(ids: string[]): void {
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(ids));
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(getLayout: () => LayoutWidths): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistLayout(getLayout());
    persistTimer = null;
  }, 120);
}

function pickSymbolForMarket(watchlistIds: string[], marketType: MarketType, fallback: string): string {
  const match = resolveWatchlistItems(watchlistIds).find((item) => item.marketType === marketType);
  return match?.symbolId ?? fallback;
}

const initialWatchlistIds = loadWatchlistIds();
const initialSymbol =
  pickSymbolForMarket(initialWatchlistIds, 'spot', DEFAULT_WATCHLIST_IDS[0]!);

export const useTerminalStore = create<TerminalState>((set, get) => ({
  marketType: 'spot',
  symbolId: initialSymbol,
  interval: '15m',
  layout: loadLayout(),
  watchlistIds: initialWatchlistIds,
  setMarketType: (marketType) => {
    const nextId = pickSymbolForMarket(get().watchlistIds, marketType, get().symbolId);
    set({
      marketType,
      symbolId: nextId,
    });
  },
  setSymbolId: (symbolId) => {
    const item = getInstrument(symbolId);
    set({
      symbolId,
      marketType: item?.marketType ?? get().marketType,
    });
  },
  setInterval: (interval) => set({ interval }),
  setLayout: (patch) => {
    const layout = {
      watchlist: clamp(patch.watchlist ?? get().layout.watchlist, 180, 420),
      ai: clamp(patch.ai ?? get().layout.ai, 240, 480),
      bottom: clamp(patch.bottom ?? get().layout.bottom, 160, 360),
    };
    set({ layout });
    schedulePersist(() => get().layout);
  },
  addToWatchlist: (symbolId) => {
    if (!getInstrument(symbolId)) {
      return;
    }
    const { watchlistIds } = get();
    if (watchlistIds.includes(symbolId)) {
      set({ symbolId, marketType: getInstrument(symbolId)!.marketType });
      return;
    }
    const next = [...watchlistIds, symbolId];
    persistWatchlist(next);
    const instrument = getInstrument(symbolId)!;
    set({
      watchlistIds: next,
      symbolId,
      marketType: instrument.marketType,
    });
  },
  removeFromWatchlist: (symbolId) => {
    const { watchlistIds, symbolId: activeId, marketType } = get();
    if (!watchlistIds.includes(symbolId)) {
      return;
    }
    const next = watchlistIds.filter((id) => id !== symbolId);
    if (next.length === 0) {
      return;
    }
    persistWatchlist(next);

    if (activeId !== symbolId) {
      set({ watchlistIds: next });
      return;
    }

    const replacement =
      resolveWatchlistItems(next).find((item) => item.marketType === marketType)?.symbolId ??
      next[0]!;
    const instrument = getInstrument(replacement);
    set({
      watchlistIds: next,
      symbolId: replacement,
      marketType: instrument?.marketType ?? marketType,
    });
  },
}));
