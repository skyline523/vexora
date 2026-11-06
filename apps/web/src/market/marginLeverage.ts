import { useEffect } from 'react';
import { create } from 'zustand';
import { fetchMarginLeverage } from '../api/market';

interface MarginLeverageState {
  leverage: Record<string, number>;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useMarginLeverageStore = create<MarginLeverageState>((set, get) => ({
  leverage: {},
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const leverage = await fetchMarginLeverage();
      set({ leverage });
    } catch {
      set({ leverage: {} });
    }
  },
}));

/** Spot cross-margin multiples keyed by raw symbol, e.g. BTCUSDT → 10. */
export function useMarginLeverage(): Record<string, number> {
  const leverage = useMarginLeverageStore((state) => state.leverage);
  const load = useMarginLeverageStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return leverage;
}
