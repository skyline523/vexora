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
      layout: { watchlist: 240, ai: 320, market: 280 },
      watchlistIds: [
        'binance:spot:BTC/USDT',
        'binance:spot:ETH/USDT',
        'binance:usdt_perpetual:BTC/USDT',
      ],
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
    useTerminalStore.getState().setLayout({ watchlist: 999, ai: 10, market: 500 });
    const state = useTerminalStore.getState();
    expect(state.layout.watchlist).toBe(420);
    expect(state.layout.ai).toBe(240);
    expect(state.layout.market).toBe(400);

    vi.advanceTimersByTime(150);
    expect(localStorage.getItem('vexora.terminal.layout.v2')).toContain('"watchlist":420');
  });

  it('adds and removes watchlist symbols', () => {
    useTerminalStore.getState().addToWatchlist('binance:spot:LINK/USDT');
    expect(useTerminalStore.getState().watchlistIds).toContain('binance:spot:LINK/USDT');
    expect(useTerminalStore.getState().symbolId).toBe('binance:spot:LINK/USDT');
    expect(localStorage.getItem('vexora.terminal.watchlist.v1')).toContain('LINK/USDT');

    useTerminalStore.getState().removeFromWatchlist('binance:spot:LINK/USDT');
    expect(useTerminalStore.getState().watchlistIds).not.toContain('binance:spot:LINK/USDT');
  });

  it('keeps at least one watchlist symbol', () => {
    useTerminalStore.setState({
      watchlistIds: ['binance:spot:BTC/USDT'],
      symbolId: 'binance:spot:BTC/USDT',
    });
    useTerminalStore.getState().removeFromWatchlist('binance:spot:BTC/USDT');
    expect(useTerminalStore.getState().watchlistIds).toEqual(['binance:spot:BTC/USDT']);
  });
});
