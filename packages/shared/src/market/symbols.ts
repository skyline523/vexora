import type { ExchangeId, MarketSymbol, MarketType } from './types';

export function buildSymbolId(
  exchange: ExchangeId,
  marketType: MarketType,
  base: string,
  quote: string,
): string {
  return `${exchange}:${marketType}:${base.toUpperCase()}/${quote.toUpperCase()}`;
}

export function createMarketSymbol(input: {
  exchange: ExchangeId;
  marketType: MarketType;
  base: string;
  quote: string;
  rawSymbol?: string;
}): MarketSymbol {
  const base = input.base.toUpperCase();
  const quote = input.quote.toUpperCase();
  return {
    exchange: input.exchange,
    marketType: input.marketType,
    base,
    quote,
    rawSymbol: (input.rawSymbol ?? `${base}${quote}`).toUpperCase(),
    symbolId: buildSymbolId(input.exchange, input.marketType, base, quote),
  };
}

export function parseSymbolId(symbolId: string): {
  exchange: ExchangeId;
  marketType: MarketType;
  base: string;
  quote: string;
} {
  const [exchange, marketType, pair] = symbolId.split(':');
  if (!exchange || !marketType || !pair) {
    throw new Error(`Invalid symbolId: ${symbolId}`);
  }
  const slash = pair.indexOf('/');
  if (slash <= 0 || slash === pair.length - 1) {
    throw new Error(`Invalid symbolId pair: ${symbolId}`);
  }
  const base = pair.slice(0, slash);
  const quote = pair.slice(slash + 1);
  if (exchange !== 'binance') {
    throw new Error(`Unsupported exchange in symbolId: ${exchange}`);
  }
  if (marketType !== 'spot' && marketType !== 'usdt_perpetual') {
    throw new Error(`Unsupported marketType in symbolId: ${marketType}`);
  }
  return { exchange, marketType, base, quote };
}
