import type { VexoraDatabase } from './client';

/** Thin base so Nest / services share one db handle without framework coupling. */
export abstract class RepositoryBase {
  constructor(protected readonly db: VexoraDatabase) {}
}
