import {
  createMarketSymbol,
  parseSymbolId,
  type MarketSymbol,
} from '@vexora/shared';

export interface OrderBookQuery {
  symbolId?: string;
  depth?: string;
}

export interface ParsedOrderBookQuery {
  symbol: MarketSymbol;
  depth: number;
}

export function parseOrderBookQuery(query: OrderBookQuery): ParsedOrderBookQuery {
  if (!query.symbolId || typeof query.symbolId !== 'string') {
    throw new Error('symbolId is required');
  }
  const parsed = parseSymbolId(query.symbolId);
  const depthRaw = query.depth == null || query.depth === '' ? 20 : Number(query.depth);
  if (!Number.isFinite(depthRaw) || depthRaw < 1) {
    throw new Error('depth must be a positive number');
  }
  return {
    symbol: createMarketSymbol(parsed),
    depth: Math.min(Math.floor(depthRaw), 100),
  };
}
