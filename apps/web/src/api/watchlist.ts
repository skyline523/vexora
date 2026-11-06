import type { ApiResponse } from '@vexora/shared';

export interface WatchlistApiItem {
  id: string;
  symbolId: string;
  exchange: string;
  marketType: string;
  base: string;
  quote: string;
  rawSymbol: string;
  sortOrder: number;
  createdAt: number;
}

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T> | { message?: unknown };
  if (!response.ok || !('ok' in body) || !body.ok) {
    const fallback =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : response.statusText;
    const message =
      body && typeof body === 'object' && 'ok' in body && body.ok === false
        ? body.error.message
        : fallback;
    throw new Error(message || 'Watchlist request failed');
  }
  return body.data;
}

export async function fetchWatchlist(): Promise<WatchlistApiItem[]> {
  const response = await fetch(`${apiBase()}/api/watchlist`);
  return readJson<WatchlistApiItem[]>(response);
}

export async function addWatchlistSymbol(symbolId: string): Promise<WatchlistApiItem> {
  const response = await fetch(`${apiBase()}/api/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbolId }),
  });
  return readJson<WatchlistApiItem>(response);
}

export async function removeWatchlistItem(idOrSymbolId: string): Promise<void> {
  const response = await fetch(`${apiBase()}/api/watchlist/${encodeURIComponent(idOrSymbolId)}`, {
    method: 'DELETE',
  });
  await readJson<{ removed: boolean; id: string }>(response);
}
