import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/** Resolve DATABASE_URL / DATA_DIR relative to process.cwd() when not absolute. */
export function resolveSqlitePath(databaseUrl: string, cwd = process.cwd()): string {
  const stripped = databaseUrl.replace(/^file:/, '');
  return isAbsolute(stripped) ? stripped : resolve(cwd, stripped);
}

export function resolveDataDir(dataDir: string, cwd = process.cwd()): string {
  return isAbsolute(dataDir) ? dataDir : resolve(cwd, dataDir);
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
