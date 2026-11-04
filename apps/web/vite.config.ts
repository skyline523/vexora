import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiBase = env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@vexora/shared': path.resolve(rootDir, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
  };
});
