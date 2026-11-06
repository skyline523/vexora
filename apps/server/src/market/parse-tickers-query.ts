import { createMarketSymbol, parseSymbolId, type MarketSymbol } from '@vexora/shared';

export interface TickersQuery {
  symbolIds?: string;
}

export function parseTickersQuery(query: TickersQuery): MarketSymbol[] {
  const raw = query.symbolIds?.trim();
  if (!raw) {
    throw new Error('symbolIds is required');
  }

  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error('symbolIds is required');
  }
  if (ids.length > 20) {
    throw new Error('symbolIds supports at most 20 symbols');
  }

  return ids.map((symbolId) => createMarketSymbol(parseSymbolId(symbolId)));
}
