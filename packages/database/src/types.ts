import type { ExchangeId, MarketType } from '@vexora/shared';

export interface ExchangeConfigRecord {
  id: string;
  exchange: ExchangeId | string;
  label: string;
  enabled: boolean;
  /** Present only when a key is stored; never returns plaintext secret. */
  hasApiKey: boolean;
  hasApiSecret: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertExchangeConfigInput {
  id?: string;
  exchange: string;
  label: string;
  enabled?: boolean;
  /** Write-only; omit to leave unchanged. Pass empty string to clear. */
  apiKey?: string | null;
  apiSecret?: string | null;
}

export type ModelProvider = 'openai_compatible' | 'anthropic' | string;

export interface ModelConfigRecord {
  id: string;
  provider: ModelProvider;
  label: string;
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  supportsTools: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertModelConfigInput {
  id?: string;
  provider: string;
  label: string;
  baseUrl: string;
  modelId: string;
  /** Write-only; omit to leave unchanged on update. */
  apiKey?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  supportsTools?: number;
  isDefault?: boolean;
}

export interface WatchlistItemRecord {
  id: string;
  symbolId: string;
  exchange: ExchangeId | string;
  marketType: MarketType | string;
  base: string;
  quote: string;
  rawSymbol: string;
  sortOrder: number;
  createdAt: number;
}

export interface AddWatchlistItemInput {
  symbolId: string;
  exchange: string;
  marketType: string;
  base: string;
  quote: string;
  rawSymbol: string;
  sortOrder?: number;
}
