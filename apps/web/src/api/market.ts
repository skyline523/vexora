import type {
  ApiResponse,
  ExchangeInstrument,
  ExchangeId,
  Kline,
  KlineInterval,
  MarketType,
  Ticker,
} from '@vexora/shared';

export interface KlineQueryInput {
  symbolId: string;
  interval: KlineInterval;
  limit?: number;
  endTime?: number;
}

export interface InstrumentsQueryInput {
  exchange?: ExchangeId;
  marketType: MarketType;
  q?: string;
  quote?: string;
  limit?: number;
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

async function readMarketJson<T>(response: Response, fallbackMessage: string): Promise<T> {
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
    throw new Error(message || fallbackMessage);
  }
  return body.data;
}

export async function fetchKlines(params: KlineQueryInput): Promise<Kline[]> {
  const response = await fetch(`/api/markets/klines?${klineQuery(params)}`);
  const data = await readMarketJson<{ klines: Kline[] }>(response, 'Failed to load klines');
  return data.klines;
}

export async function fetchInstruments(
  params: InstrumentsQueryInput,
): Promise<ExchangeInstrument[]> {
  const query = new URLSearchParams({
    exchange: params.exchange ?? 'binance',
    marketType: params.marketType,
  });
  if (params.q) query.set('q', params.q);
  if (params.quote) query.set('quote', params.quote);
  if (params.limit != null) query.set('limit', String(params.limit));

  const response = await fetch(`/api/markets/instruments?${query.toString()}`);
  const data = await readMarketJson<{ instruments: ExchangeInstrument[] }>(
    response,
    'Failed to load instruments',
  );
  return data.instruments;
}

export async function fetchMarginLeverage(): Promise<Record<string, number>> {
  const response = await fetch('/api/markets/margin-leverage');
  const data = await readMarketJson<{ leverage: Record<string, number> }>(
    response,
    'Failed to load margin leverage',
  );
  return data.leverage ?? {};
}

export async function fetchTickers(symbolIds: readonly string[]): Promise<Ticker[]> {
  if (symbolIds.length === 0) return [];
  const query = new URLSearchParams({
    symbolIds: symbolIds.join(','),
  });
  const response = await fetch(`/api/markets/tickers?${query.toString()}`);
  const data = await readMarketJson<{ tickers: Ticker[] }>(response, 'Failed to load tickers');
  return data.tickers;
}
