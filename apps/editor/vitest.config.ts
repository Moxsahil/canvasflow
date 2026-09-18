import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    globals: true,
    /**
     * `src/lib/env.ts` validates at import and throws when these are absent,
     * so any module that reaches it takes the whole suite down before a single
     * test runs — which is what happened the first time a settings component
     * pulled in a client that talks to the gateway.
     *
     * A developer machine hides this, because Vite loads `apps/editor/.env`
     * and the suite passes. A fresh checkout and CI have no such file.
     *
     * The values are placeholders. Nothing here makes a request; they exist so
     * importing a module is not the same as configuring an environment.
     */
    env: {
      VITE_API_URL: 'http://localhost:3001',
      VITE_WEB_URL: 'http://localhost:3000',
      VITE_SYNC_URL: 'ws://localhost:4000',
      VITE_PRESENCE_URL: 'ws://localhost:4002',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
