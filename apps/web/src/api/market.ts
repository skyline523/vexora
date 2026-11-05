import type { ApiResponse, Kline, KlineInterval } from '@vexora/shared';

export interface KlineQueryInput {
  symbolId: string;
  interval: KlineInterval;
  limit?: number;
  endTime?: number;
}

export function klineQuery(params: KlineQueryInput): string {
  const query = new URLSearchParams({
    symbolId: params.symbolId,
    interval: params.interval,
  });
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.endTime != null) query.set('endTime', String(params.endTime));
  return query.toString();
}

export function marketWebSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://127.0.0.1:8787/ws';
}

export async function fetchKlines(params: KlineQueryInput): Promise<Kline[]> {
  const response = await fetch(`/api/markets/klines?${klineQuery(params)}`);
  const body = (await response.json()) as ApiResponse<{ klines: Kline[] }> | { message?: unknown };
  if (!response.ok || !('ok' in body) || !body.ok) {
    const fallback =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : response.statusText;
    const message =
      body && typeof body === 'object' && 'ok' in body && body.ok === false
        ? body.error.message
        : fallback;
    throw new Error(message || 'Failed to load klines');
  }
  return body.data.klines;
}
