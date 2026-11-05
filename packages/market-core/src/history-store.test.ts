import { createMarketSymbol, type Kline } from '@vexora/shared';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKlineHistoryStore } from './history-store';

const symbol = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

const dirs: string[] = [];

function bar(openTime: number, close: number): Kline {
  const closeTime = openTime + 59_999;
  return {
    symbolId: symbol.symbolId,
    interval: '1m',
    openTime,
    closeTime,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
    ts: closeTime,
    receivedAt: close,
  };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('FileKlineHistoryStore', () => {
  it('round-trips closed candles and dedupes a newer write', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'vexora-market-'));
    dirs.push(dataDir);
    const store = new FileKlineHistoryStore(dataDir);
    const openTime = Date.UTC(2024, 0, 2, 0, 1);

    await store.write([bar(openTime, 10), bar(openTime + 60_000, 11)]);
    await store.write([bar(openTime, 12)]);

    const rows = await store.read({ symbol, interval: '1m', limit: 10 });
    expect(rows.map((kline) => [kline.openTime, kline.close])).toEqual([
      [openTime, 12],
      [openTime + 60_000, 11],
    ]);
  });
});
