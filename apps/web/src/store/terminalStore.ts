import { create } from 'zustand';
import { WATCHLIST } from '../data/mockMarket';
import type { KlineInterval, MarketType } from '../types/terminal';

const STORAGE_KEY = 'vexora.terminal.layout.v1';

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
  setMarketType: (marketType: MarketType) => void;
  setSymbolId: (symbolId: string) => void;
  setInterval: (interval: KlineInterval) => void;
  setLayout: (patch: Partial<LayoutWidths>) => void;
}

function loadLayout(): LayoutWidths {
  const fallback: LayoutWidths = {
    watchlist: 240,
    ai: 320,
    bottom: 220,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persistLayout(layout: LayoutWidths): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
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

const initialSymbol =
  WATCHLIST.find((item) => item.marketType === 'spot')?.symbolId ?? WATCHLIST[0]!.symbolId;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  marketType: 'spot',
  symbolId: initialSymbol,
  interval: '15m',
  layout: loadLayout(),
  setMarketType: (marketType) => {
    const next = WATCHLIST.find((item) => item.marketType === marketType);
    set({
      marketType,
      symbolId: next?.symbolId ?? get().symbolId,
    });
  },
  setSymbolId: (symbolId) => {
    const item = WATCHLIST.find((entry) => entry.symbolId === symbolId);
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
}));
