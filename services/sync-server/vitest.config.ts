import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // One throwaway Postgres for the whole run, started before any test file.
    globalSetup: ['./src/testing/global-setup.ts'],
    // The integration files start real servers and wait on real debounce
    // timers; running them one at a time keeps those timings honest.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      reporter: ['text', 'json-summary'],
    },
  },
});
