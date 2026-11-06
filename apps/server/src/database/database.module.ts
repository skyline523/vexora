import { Global, Module } from '@nestjs/common';
import {
  ExchangeConfigRepository,
  getMigrationsFolder,
  ModelConfigRepository,
  openDatabase,
  seedDefaults,
  WatchlistRepository,
  type VexoraDatabase,
} from '@vexora/database';
import { createLogger, serverEnvSchema } from '@vexora/shared';
import type { Client } from '@libsql/client';
import { DatabaseService } from './database.service';
import { VEXORA_DB, VEXORA_DB_CLIENT, VEXORA_DB_PATH } from './database.tokens';

const logger = createLogger('database');

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_BOOTSTRAP',
      useFactory: async () => {
        const env = serverEnvSchema.parse(process.env);
        const opened = await openDatabase({
          databaseUrl: env.DATABASE_URL,
          migrationsFolder: getMigrationsFolder(),
        });
        await seedDefaults(opened.db);
        logger.info('sqlite ready', { path: opened.path });
        return opened;
      },
    },
    {
      provide: VEXORA_DB,
      inject: ['DATABASE_BOOTSTRAP'],
      useFactory: (opened: { db: VexoraDatabase }) => opened.db,
    },
    {
      provide: VEXORA_DB_CLIENT,
      inject: ['DATABASE_BOOTSTRAP'],
      useFactory: (opened: { client: Client }) => opened.client,
    },
    {
      provide: VEXORA_DB_PATH,
      inject: ['DATABASE_BOOTSTRAP'],
      useFactory: (opened: { path: string }) => opened.path,
    },
    DatabaseService,
    {
      provide: WatchlistRepository,
      inject: [VEXORA_DB],
      useFactory: (db: VexoraDatabase) => new WatchlistRepository(db),
    },
    {
      provide: ExchangeConfigRepository,
      inject: [VEXORA_DB],
      useFactory: (db: VexoraDatabase) => new ExchangeConfigRepository(db),
    },
    {
      provide: ModelConfigRepository,
      inject: [VEXORA_DB],
      useFactory: (db: VexoraDatabase) => new ModelConfigRepository(db),
    },
  ],
  exports: [DatabaseService, WatchlistRepository, ExchangeConfigRepository, ModelConfigRepository],
})
export class DatabaseModule {}
