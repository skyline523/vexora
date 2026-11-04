import { z } from 'zod';

export const serverEnvSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOCAL_SESSION_TOKEN: z.string().min(1).default('dev-token-change-me'),
  DATABASE_URL: z.string().default('file:../../data/alpha-terminal.sqlite'),
  DATA_DIR: z.string().default('../../data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://127.0.0.1:8787'),
  VITE_WS_URL: z.string().default('ws://127.0.0.1:8787/ws'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
