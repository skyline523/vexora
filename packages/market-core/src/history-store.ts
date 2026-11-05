import { parseSymbolId, type Kline, type KlineInterval, type MarketSymbol } from '@vexora/shared';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mergeKlineLists, selectKlines, type KlineQuery } from './kline-merge';

export interface KlineHistoryQuery extends KlineQuery {
  symbol: MarketSymbol;
  interval: KlineInterval;
}

export interface KlineHistoryStore {
  read(query: KlineHistoryQuery): Promise<Kline[]>;
  write(klines: readonly Kline[]): Promise<void>;
}

const SYMBOL_PART = /^[A-Z0-9]+$/;

function monthKey(openTime: number): string {
  return new Date(openTime).toISOString().slice(0, 7);
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

/**
 * JSONL history under `{dataDir}/market/{exchange}/{marketType}/{BASE}-{QUOTE}/{interval}/YYYY-MM.jsonl`.
 */
export class FileKlineHistoryStore implements KlineHistoryStore {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly dataDir: string) {}

  async read(query: KlineHistoryQuery): Promise<Kline[]> {
    const files = await this.listFiles(query);
    const groups: Kline[][] = [];
    for (const file of files) {
      groups.push(await this.readFile(file));
    }
    return selectKlines(mergeKlineLists(groups), query);
  }

  async write(klines: readonly Kline[]): Promise<void> {
    if (klines.length === 0) return;
    const groups = new Map<string, Kline[]>();
    for (const kline of klines) {
      const file = this.fileForKline(kline);
      const rows = groups.get(file) ?? [];
      rows.push(kline);
      groups.set(file, rows);
    }

    await Promise.all(
      [...groups.entries()].map(([file, rows]) =>
        this.withLock(file, async () => {
          await mkdir(path.dirname(file), { recursive: true });
          const merged = mergeKlineLists([await this.readFile(file), rows]);
          const body =
            merged.length > 0 ? `${merged.map((row) => JSON.stringify(row)).join('\n')}\n` : '';
          await writeFile(file, body, 'utf8');
        }),
      ),
    );
  }

  private directory(symbol: MarketSymbol, interval: KlineInterval): string {
    assertSafeSymbol(symbol);
    return path.join(
      this.dataDir,
      'market',
      symbol.exchange,
      symbol.marketType,
      `${symbol.base}-${symbol.quote}`,
      interval,
    );
  }

  private fileForKline(kline: Kline): string {
    const parsed = parseSymbolId(kline.symbolId);
    if (!SYMBOL_PART.test(parsed.base) || !SYMBOL_PART.test(parsed.quote)) {
      throw new Error(`Unsafe symbolId: ${kline.symbolId}`);
    }
    const symbol: MarketSymbol = {
      exchange: parsed.exchange,
      marketType: parsed.marketType,
      base: parsed.base,
      quote: parsed.quote,
      rawSymbol: `${parsed.base}${parsed.quote}`,
      symbolId: kline.symbolId,
    };
    return path.join(this.directory(symbol, kline.interval), `${monthKey(kline.openTime)}.jsonl`);
  }

  private async listFiles(query: KlineHistoryQuery): Promise<string[]> {
    const dir = this.directory(query.symbol, query.interval);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }

    const startMonth = query.startTime == null ? undefined : monthKey(query.startTime);
    const endMonth = query.endTime == null ? undefined : monthKey(Math.max(0, query.endTime - 1));
    return names
      .filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name))
      .filter((name) => {
        const month = name.slice(0, 7);
        if (startMonth && month < startMonth) return false;
        if (endMonth && month > endMonth) return false;
        return true;
      })
      .sort()
      .map((name) => path.join(dir, name));
  }

  private async readFile(file: string): Promise<Kline[]> {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }

    const rows: Kline[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const value = JSON.parse(trimmed) as Kline;
        if (!value || typeof value.openTime !== 'number' || typeof value.symbolId !== 'string') {
          continue;
        }
        rows.push(value);
      } catch {
        continue;
      }
    }
    return rows;
  }

  private async withLock(file: string, task: () => Promise<void>): Promise<void> {
    const previous = this.locks.get(file) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.locks.set(
      file,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    await run;
  }
}

function assertSafeSymbol(symbol: MarketSymbol): void {
  if (!SYMBOL_PART.test(symbol.base) || !SYMBOL_PART.test(symbol.quote)) {
    throw new Error(`Unsafe market symbol: ${symbol.symbolId}`);
  }
}
