import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, type VexoraDatabase } from '../client';
import { seedDefaults } from '../seed';
import { ExchangeConfigRepository } from './exchange-config-repository';
import { ModelConfigRepository } from './model-config-repository';
import { WatchlistRepository } from './watchlist-repository';

describe('database repositories', () => {
  let db: VexoraDatabase;
  let client: Client;

  beforeEach(async () => {
    const opened = await openDatabase({
      databaseUrl: ':memory:',
      migrationsFolder: join(__dirname, '../../drizzle'),
    });
    db = opened.db;
    client = opened.client;
  });

  afterEach(() => {
    closeDatabase(client);
  });

  it('initializes schema via migration', async () => {
    const result = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    const names = result.rows.map((row) => String(row.name));
    expect(names).toContain('exchange_config');
    expect(names).toContain('model_config');
    expect(names).toContain('watchlist_item');
    expect(names).toContain('app_setting');
  });

  it('persists watchlist CRUD and reorder', async () => {
    const repo = new WatchlistRepository(db);
    const a = await repo.add({
      symbolId: 'binance:spot:BTC/USDT',
      exchange: 'binance',
      marketType: 'spot',
      base: 'BTC',
      quote: 'USDT',
      rawSymbol: 'BTCUSDT',
    });
    const b = await repo.add({
      symbolId: 'binance:spot:ETH/USDT',
      exchange: 'binance',
      marketType: 'spot',
      base: 'ETH',
      quote: 'USDT',
      rawSymbol: 'ETHUSDT',
    });

    expect((await repo.list()).map((i) => i.symbolId)).toEqual([
      'binance:spot:BTC/USDT',
      'binance:spot:ETH/USDT',
    ]);

    expect(
      (
        await repo.add({
          symbolId: 'binance:spot:BTC/USDT',
          exchange: 'binance',
          marketType: 'spot',
          base: 'BTC',
          quote: 'USDT',
          rawSymbol: 'BTCUSDT',
        })
      ).id,
    ).toBe(a.id);

    await repo.reorder([b.id, a.id]);
    expect((await repo.list()).map((i) => i.symbolId)).toEqual([
      'binance:spot:ETH/USDT',
      'binance:spot:BTC/USDT',
    ]);

    expect(await repo.removeById(a.id)).toBe(true);
    expect(await repo.list()).toHaveLength(1);
  });

  it('persists exchange config without leaking secrets', async () => {
    const repo = new ExchangeConfigRepository(db);
    const created = await repo.create({
      exchange: 'binance',
      label: 'Binance',
      apiKey: 'key-plain',
      apiSecret: 'secret-plain',
    });

    expect(created.hasApiKey).toBe(true);
    expect(created.hasApiSecret).toBe(true);
    expect(JSON.stringify(created)).not.toContain('key-plain');
    expect(JSON.stringify(created)).not.toContain('secret-plain');

    const updated = await repo.update(created.id, {
      label: 'Binance Main',
      apiKey: '',
    });
    expect(updated?.label).toBe('Binance Main');
    expect(updated?.hasApiKey).toBe(false);
    expect(updated?.hasApiSecret).toBe(true);
  });

  it('persists model config and default flag exclusivity', async () => {
    const repo = new ModelConfigRepository(db);
    const first = await repo.create({
      provider: 'openai_compatible',
      label: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o-mini',
      apiKey: 'sk-test',
      isDefault: true,
    });
    const second = await repo.create({
      provider: 'anthropic',
      label: 'Claude',
      baseUrl: 'https://api.anthropic.com',
      modelId: 'claude-sonnet-4',
      apiKey: 'sk-ant',
      isDefault: true,
    });

    expect((await repo.findById(first.id))?.isDefault).toBe(false);
    expect((await repo.findById(second.id))?.isDefault).toBe(true);
    expect((await repo.list())[0]?.hasApiKey).toBe(true);
    expect(JSON.stringify(await repo.list())).not.toContain('sk-test');
  });

  it('seeds defaults only once', async () => {
    await seedDefaults(db);
    await seedDefaults(db);

    const exchanges = await new ExchangeConfigRepository(db).list();
    const watchlist = await new WatchlistRepository(db).list();
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.exchange).toBe('binance');
    expect(watchlist.length).toBeGreaterThanOrEqual(6);
    expect(watchlist.some((item) => item.marketType === 'usdt_perpetual')).toBe(true);
  });

  it('backfills default contracts onto a spot-only watchlist', async () => {
    await new WatchlistRepository(db).add({
      symbolId: 'binance:spot:BTC/USDT',
      exchange: 'binance',
      marketType: 'spot',
      base: 'BTC',
      quote: 'USDT',
      rawSymbol: 'BTCUSDT',
    });

    await seedDefaults(db);
    await seedDefaults(db);

    const watchlist = await new WatchlistRepository(db).list();
    expect(watchlist.map((item) => item.symbolId)).toEqual([
      'binance:spot:BTC/USDT',
      'binance:usdt_perpetual:BTC/USDT',
      'binance:usdt_perpetual:ETH/USDT',
    ]);
  });

  it('survives reopen on the same sqlite file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vexora-db-file-'));
    const databaseUrl = `file:${join(dir, 'persist.sqlite')}`;
    const migrationsFolder = join(__dirname, '../../drizzle');

    const first = await openDatabase({ databaseUrl, migrationsFolder });
    await new WatchlistRepository(first.db).add({
      symbolId: 'binance:spot:SOL/USDT',
      exchange: 'binance',
      marketType: 'spot',
      base: 'SOL',
      quote: 'USDT',
      rawSymbol: 'SOLUSDT',
    });
    closeDatabase(first.client);

    const second = await openDatabase({ databaseUrl, migrationsFolder });
    const items = await new WatchlistRepository(second.db).list();
    expect(items.map((i) => i.symbolId)).toContain('binance:spot:SOL/USDT');
    closeDatabase(second.client);

    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle; ignore cleanup failures in CI/dev.
    }
  });
});
