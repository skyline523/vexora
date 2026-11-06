import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const exchangeConfig = sqliteTable('exchange_config', {
  id: text('id').primaryKey(),
  exchange: text('exchange').notNull(),
  label: text('label').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  apiKeyEnc: text('api_key_enc'),
  apiSecretEnc: text('api_secret_enc'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const modelConfig = sqliteTable('model_config', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  baseUrl: text('base_url').notNull(),
  modelId: text('model_id').notNull(),
  apiKeyEnc: text('api_key_enc').notNull().default(''),
  temperature: real('temperature').notNull().default(0.2),
  maxOutputTokens: integer('max_output_tokens').notNull().default(4096),
  timeoutMs: integer('timeout_ms').notNull().default(60_000),
  supportsTools: integer('supports_tools').notNull().default(0),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const watchlistItem = sqliteTable(
  'watchlist_item',
  {
    id: text('id').primaryKey(),
    symbolId: text('symbol_id').notNull(),
    exchange: text('exchange').notNull(),
    marketType: text('market_type').notNull(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rawSymbol: text('raw_symbol').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('watchlist_item_symbol_id_uidx').on(table.symbolId)],
);

export const appSetting = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type ExchangeConfigRow = typeof exchangeConfig.$inferSelect;
export type ModelConfigRow = typeof modelConfig.$inferSelect;
export type WatchlistItemRow = typeof watchlistItem.$inferSelect;
export type AppSettingRow = typeof appSetting.$inferSelect;
