import { asc, eq } from 'drizzle-orm';
import type { VexoraDatabase } from '../client';
import { newId, nowMs } from '../id';
import { RepositoryBase } from '../repository-base';
import { modelConfig, type ModelConfigRow } from '../schema';
import type { ModelConfigRecord, UpsertModelConfigInput } from '../types';

function toRecord(row: ModelConfigRow): ModelConfigRecord {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    hasApiKey: Boolean(row.apiKeyEnc),
    temperature: row.temperature,
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
    supportsTools: row.supportsTools,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ModelConfigRepository extends RepositoryBase {
  constructor(db: VexoraDatabase) {
    super(db);
  }

  async list(): Promise<ModelConfigRecord[]> {
    const rows = await this.db.select().from(modelConfig).orderBy(asc(modelConfig.createdAt));
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ModelConfigRecord | undefined> {
    const rows = await this.db.select().from(modelConfig).where(eq(modelConfig.id, id)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async getApiKeyEnc(id: string): Promise<string | undefined> {
    const rows = await this.db.select().from(modelConfig).where(eq(modelConfig.id, id)).limit(1);
    return rows[0]?.apiKeyEnc;
  }

  async create(input: UpsertModelConfigInput): Promise<ModelConfigRecord> {
    const ts = nowMs();
    const row: ModelConfigRow = {
      id: input.id ?? newId(),
      provider: input.provider,
      label: input.label,
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      apiKeyEnc: input.apiKey ?? '',
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 4096,
      timeoutMs: input.timeoutMs ?? 60_000,
      supportsTools: input.supportsTools ?? 0,
      isDefault: input.isDefault ?? false,
      createdAt: ts,
      updatedAt: ts,
    };

    await this.db.transaction(async (tx) => {
      if (row.isDefault) {
        await tx.update(modelConfig).set({ isDefault: false });
      }
      await tx.insert(modelConfig).values(row);
    });

    return toRecord(row);
  }

  async update(id: string, input: Partial<UpsertModelConfigInput>): Promise<ModelConfigRecord | undefined> {
    const rows = await this.db.select().from(modelConfig).where(eq(modelConfig.id, id)).limit(1);
    const existing = rows[0];
    if (!existing) return undefined;

    const next: ModelConfigRow = {
      ...existing,
      provider: input.provider ?? existing.provider,
      label: input.label ?? existing.label,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      modelId: input.modelId ?? existing.modelId,
      temperature: input.temperature ?? existing.temperature,
      maxOutputTokens: input.maxOutputTokens ?? existing.maxOutputTokens,
      timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      supportsTools: input.supportsTools ?? existing.supportsTools,
      isDefault: input.isDefault ?? existing.isDefault,
      updatedAt: nowMs(),
    };

    if (input.apiKey !== undefined) {
      next.apiKeyEnc = input.apiKey ?? '';
    }

    await this.db.transaction(async (tx) => {
      if (next.isDefault) {
        await tx.update(modelConfig).set({ isDefault: false });
      }
      await tx.update(modelConfig).set(next).where(eq(modelConfig.id, id));
    });

    return toRecord(next);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.delete(modelConfig).where(eq(modelConfig.id, id));
    return (result.rowsAffected ?? 0) > 0;
  }

  async setDefault(id: string): Promise<ModelConfigRecord | undefined> {
    const existing = await this.findById(id);
    if (!existing) return undefined;
    return this.update(id, { isDefault: true });
  }
}
