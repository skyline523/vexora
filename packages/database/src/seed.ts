import { createMarketSymbol, parseSymbolId } from '@vexora/shared';
import type { VexoraDatabase } from './client';
import { ExchangeConfigRepository } from './repositories/exchange-config-repository';
import { WatchlistRepository } from './repositories/watchlist-repository';

export const DEFAULT_WATCHLIST_SYMBOL_IDS = [
  'binance:spot:BTC/USDT',
  'binance:spot:ETH/USDT',
  'binance:spot:SOL/USDT',
  'binance:spot:BNB/USDT',
  'binance:usdt_perpetual:BTC/USDT',
  'binance:usdt_perpetual:ETH/USDT',
] as const;

async function addWatchlistSymbol(
  watchlist: WatchlistRepository,
  symbolId: string,
  sortOrder: number,
): Promise<void> {
  const parsed = parseSymbolId(symbolId);
  const symbol = createMarketSymbol(parsed);
  await watchlist.add({
    symbolId: symbol.symbolId,
    exchange: symbol.exchange,
    marketType: symbol.marketType,
    base: symbol.base,
    quote: symbol.quote,
    rawSymbol: symbol.rawSymbol,
    sortOrder,
  });
}

/** Idempotent seed for first-run defaults. Does not overwrite user data. */
export async function seedDefaults(db: VexoraDatabase): Promise<void> {
  const exchanges = new ExchangeConfigRepository(db);
  if (!(await exchanges.findByExchange('binance'))) {
    await exchanges.create({
      id: 'binance-default',
      exchange: 'binance',
      label: 'Binance',
      enabled: true,
    });
  }

  const watchlist = new WatchlistRepository(db);
  const existing = await watchlist.list();
  if (existing.length === 0) {
    for (const [index, symbolId] of DEFAULT_WATCHLIST_SYMBOL_IDS.entries()) {
      await addWatchlistSymbol(watchlist, symbolId, index);
    }
    return;
  }

  // Older databases were seeded with spot only. Add the default contracts once.
  if (existing.some((item) => item.marketType === 'usdt_perpetual')) {
    return;
  }
  const contracts = DEFAULT_WATCHLIST_SYMBOL_IDS.filter((symbolId) =>
    symbolId.includes(':usdt_perpetual:'),
  );
  for (const [index, symbolId] of contracts.entries()) {
    await addWatchlistSymbol(watchlist, symbolId, existing.length + index);
  }
}
