import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { createLogger, serverEnvSchema } from '@vexora/shared';
import { AppModule } from './app.module';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

async function bootstrap(): Promise<void> {
  const env = serverEnvSchema.parse(process.env);
  const logger = createLogger('server', { level: env.LOG_LEVEL });

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(env.PORT, env.HOST);
  logger.info('server started', { host: env.HOST, port: env.PORT });
}

void bootstrap();
