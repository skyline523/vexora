import { asc, eq, max } from 'drizzle-orm';
import type { VexoraDatabase } from '../client';
import { newId, nowMs } from '../id';
import { RepositoryBase } from '../repository-base';
import { watchlistItem, type WatchlistItemRow } from '../schema';
import type { AddWatchlistItemInput, WatchlistItemRecord } from '../types';

function toRecord(row: WatchlistItemRow): WatchlistItemRecord {
  return {
    id: row.id,
    symbolId: row.symbolId,
    exchange: row.exchange,
    marketType: row.marketType,
    base: row.base,
    quote: row.quote,
    rawSymbol: row.rawSymbol,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

export class WatchlistRepository extends RepositoryBase {
  constructor(db: VexoraDatabase) {
    super(db);
  }

  async list(): Promise<WatchlistItemRecord[]> {
    const rows = await this.db.select().from(watchlistItem).orderBy(asc(watchlistItem.sortOrder));
    return rows.map(toRecord);
  }

  async findBySymbolId(symbolId: string): Promise<WatchlistItemRecord | undefined> {
    const rows = await this.db.select().from(watchlistItem).where(eq(watchlistItem.symbolId, symbolId)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async findById(id: string): Promise<WatchlistItemRecord | undefined> {
    const rows = await this.db.select().from(watchlistItem).where(eq(watchlistItem.id, id)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async add(input: AddWatchlistItemInput): Promise<WatchlistItemRecord> {
    const existing = await this.findBySymbolId(input.symbolId);
    if (existing) {
      return existing;
    }

    const sortOrder = input.sortOrder ?? (await this.nextSortOrder());
    const row: WatchlistItemRow = {
      id: newId(),
      symbolId: input.symbolId,
      exchange: input.exchange,
      marketType: input.marketType,
      base: input.base,
      quote: input.quote,
      rawSymbol: input.rawSymbol,
      sortOrder,
      createdAt: nowMs(),
    };

    await this.db.insert(watchlistItem).values(row);
    return toRecord(row);
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.delete(watchlistItem).where(eq(watchlistItem.id, id));
    return (result.rowsAffected ?? 0) > 0;
  }

  async removeBySymbolId(symbolId: string): Promise<boolean> {
    const result = await this.db.delete(watchlistItem).where(eq(watchlistItem.symbolId, symbolId));
    return (result.rowsAffected ?? 0) > 0;
  }

  async reorder(orderedIds: string[]): Promise<WatchlistItemRecord[]> {
    await this.db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.update(watchlistItem).set({ sortOrder: index }).where(eq(watchlistItem.id, id));
      }
    });
    return this.list();
  }

  private async nextSortOrder(): Promise<number> {
    const result = await this.db.select({ value: max(watchlistItem.sortOrder) }).from(watchlistItem);
    return (result[0]?.value ?? -1) + 1;
  }
}
