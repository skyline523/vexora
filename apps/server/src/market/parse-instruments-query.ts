import type { ExchangeId, MarketType } from '@vexora/shared';

export interface InstrumentsQuery {
  exchange?: string;
  marketType?: string;
  q?: string;
  quote?: string;
  limit?: string;
}

export interface ParsedInstrumentsQuery {
  exchange: ExchangeId;
  marketType: MarketType;
  query?: string;
  quote: string;
  limit: number;
}

export function parseInstrumentsQuery(query: InstrumentsQuery): ParsedInstrumentsQuery {
  const exchange = query.exchange ?? 'binance';
  if (exchange !== 'binance') {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  const marketType = query.marketType;
  if (marketType !== 'spot' && marketType !== 'usdt_perpetual') {
    throw new Error('marketType must be spot or usdt_perpetual');
  }

  let limit = 20;
  if (query.limit != null && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('limit must be a positive number');
    }
    limit = Math.min(Math.floor(parsed), 100);
  }

  return {
    exchange,
    marketType,
    query: query.q?.trim() || undefined,
    quote: (query.quote ?? 'USDT').toUpperCase(),
    limit,
  };
}
