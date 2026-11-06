import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { closeDatabase, type VexoraDatabase } from '@vexora/database';
import { createLogger } from '@vexora/shared';
import type { Client } from '@libsql/client';
import { VEXORA_DB, VEXORA_DB_CLIENT, VEXORA_DB_PATH } from './database.tokens';

const logger = createLogger('database');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(VEXORA_DB) readonly db: VexoraDatabase,
    @Inject(VEXORA_DB_CLIENT) private readonly client: Client,
    @Inject(VEXORA_DB_PATH) readonly path: string,
  ) {}

  onModuleDestroy(): void {
    closeDatabase(this.client);
    logger.info('sqlite closed');
  }
}
