import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as schema from './schema';
import { ensureParentDir, resolveSqlitePath } from './paths';

export type VexoraDatabase = LibSQLDatabase<typeof schema>;

export interface OpenDatabaseOptions {
  databaseUrl: string;
  /** Absolute or cwd-relative path to drizzle migrations folder. */
  migrationsFolder?: string;
  /** Skip running migrations (tests may apply schema manually). */
  migrate?: boolean;
  cwd?: string;
}

function defaultMigrationsFolder(): string {
  return join(__dirname, '..', 'drizzle');
}

function toLibsqlUrl(databaseUrl: string, cwd?: string): { url: string; path: string } {
  if (databaseUrl === ':memory:' || databaseUrl === 'file::memory:') {
    return { url: ':memory:', path: ':memory:' };
  }

  const path = resolveSqlitePath(databaseUrl, cwd);
  ensureParentDir(path);
  return { url: pathToFileURL(path).href, path };
}

export async function openDatabase(options: OpenDatabaseOptions): Promise<{
  db: VexoraDatabase;
  client: Client;
  path: string;
}> {
  const { url, path } = toLibsqlUrl(options.databaseUrl, options.cwd);
  const client = createClient({ url });
  await client.execute('PRAGMA foreign_keys = ON;');

  const db = drizzle(client, { schema });

  if (options.migrate !== false) {
    await migrate(db, {
      migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder(),
    });
  }

  return { db, client, path };
}

export function closeDatabase(client: Client): void {
  client.close();
}
