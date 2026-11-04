import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalStore } from './terminalStore';

describe('terminalStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useTerminalStore.setState({
      marketType: 'spot',
      symbolId: 'binance:spot:BTC/USDT',
      interval: '15m',
      layout: { watchlist: 240, ai: 320, bottom: 220 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('switches market type and picks a matching symbol', () => {
    useTerminalStore.getState().setMarketType('usdt_perpetual');
    const state = useTerminalStore.getState();
    expect(state.marketType).toBe('usdt_perpetual');
    expect(state.symbolId).toContain('usdt_perpetual');
  });

  it('clamps and persists layout widths', () => {
    useTerminalStore.getState().setLayout({ watchlist: 999, ai: 10, bottom: 500 });
    const state = useTerminalStore.getState();
    expect(state.layout.watchlist).toBe(420);
    expect(state.layout.ai).toBe(240);
    expect(state.layout.bottom).toBe(360);

    vi.advanceTimersByTime(150);
    expect(localStorage.getItem('vexora.terminal.layout.v1')).toContain('"watchlist":420');
  });
});
