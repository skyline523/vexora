export { openDatabase, closeDatabase, type OpenDatabaseOptions, type VexoraDatabase } from './client';
export { resolveSqlitePath, resolveDataDir, ensureParentDir } from './paths';
export { getMigrationsFolder } from './migrations-path';
export { seedDefaults, DEFAULT_WATCHLIST_SYMBOL_IDS } from './seed';
export { RepositoryBase } from './repository-base';
export { WatchlistRepository } from './repositories/watchlist-repository';
export { ExchangeConfigRepository } from './repositories/exchange-config-repository';
export { ModelConfigRepository } from './repositories/model-config-repository';
export {
  exchangeConfig,
  modelConfig,
  watchlistItem,
  appSetting,
  type ExchangeConfigRow,
  type ModelConfigRow,
  type WatchlistItemRow,
  type AppSettingRow,
} from './schema';
export type {
  ExchangeConfigRecord,
  UpsertExchangeConfigInput,
  ModelConfigRecord,
  UpsertModelConfigInput,
  ModelProvider,
  WatchlistItemRecord,
  AddWatchlistItemInput,
} from './types';
