import { join } from 'node:path';

/** Absolute path to the packaged drizzle migrations directory. */
export function getMigrationsFolder(): string {
  return join(__dirname, '..', 'drizzle');
}
