import { asc, eq } from 'drizzle-orm';
import type { VexoraDatabase } from '../client';
import { newId, nowMs } from '../id';
import { RepositoryBase } from '../repository-base';
import { exchangeConfig, type ExchangeConfigRow } from '../schema';
import type { ExchangeConfigRecord, UpsertExchangeConfigInput } from '../types';

function toRecord(row: ExchangeConfigRow): ExchangeConfigRecord {
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    enabled: row.enabled,
    hasApiKey: Boolean(row.apiKeyEnc),
    hasApiSecret: Boolean(row.apiSecretEnc),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ExchangeConfigRepository extends RepositoryBase {
  constructor(db: VexoraDatabase) {
    super(db);
  }

  async list(): Promise<ExchangeConfigRecord[]> {
    const rows = await this.db.select().from(exchangeConfig).orderBy(asc(exchangeConfig.createdAt));
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ExchangeConfigRecord | undefined> {
    const rows = await this.db.select().from(exchangeConfig).where(eq(exchangeConfig.id, id)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async findByExchange(exchange: string): Promise<ExchangeConfigRecord | undefined> {
    const rows = await this.db
      .select()
      .from(exchangeConfig)
      .where(eq(exchangeConfig.exchange, exchange))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async getSecrets(
    id: string,
  ): Promise<{ apiKeyEnc: string | null; apiSecretEnc: string | null } | undefined> {
    const rows = await this.db.select().from(exchangeConfig).where(eq(exchangeConfig.id, id)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return { apiKeyEnc: row.apiKeyEnc, apiSecretEnc: row.apiSecretEnc };
  }

  async create(input: UpsertExchangeConfigInput): Promise<ExchangeConfigRecord> {
    const ts = nowMs();
    const row: ExchangeConfigRow = {
      id: input.id ?? newId(),
      exchange: input.exchange,
      label: input.label,
      enabled: input.enabled ?? true,
      apiKeyEnc: input.apiKey ?? null,
      apiSecretEnc: input.apiSecret ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.db.insert(exchangeConfig).values(row);
    return toRecord(row);
  }

  async update(
    id: string,
    input: Partial<Omit<UpsertExchangeConfigInput, 'id'>> & { label?: string },
  ): Promise<ExchangeConfigRecord | undefined> {
    const rows = await this.db.select().from(exchangeConfig).where(eq(exchangeConfig.id, id)).limit(1);
    const existing = rows[0];
    if (!existing) return undefined;

    const next: ExchangeConfigRow = {
      ...existing,
      exchange: input.exchange ?? existing.exchange,
      label: input.label ?? existing.label,
      enabled: input.enabled ?? existing.enabled,
      updatedAt: nowMs(),
    };

    if (input.apiKey !== undefined) {
      next.apiKeyEnc = input.apiKey === '' || input.apiKey === null ? null : input.apiKey;
    }
    if (input.apiSecret !== undefined) {
      next.apiSecretEnc = input.apiSecret === '' || input.apiSecret === null ? null : input.apiSecret;
    }

    await this.db.update(exchangeConfig).set(next).where(eq(exchangeConfig.id, id));
    return toRecord(next);
  }
}
