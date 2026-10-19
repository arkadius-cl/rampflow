import { defineConfig } from 'vitest/config';

// DATABASE_URL and MIGRATION_DATABASE_URL come from scripts/checkout-env.mjs (the `test` script
// runs through it); test/setup.ts points them at this worker's database.
export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      ENABLE_JOBS: '0',
      ENABLE_TEST_ROUTES: '1',
      APP_ORIGIN: 'http://rampflow.test',
      APP_EXTRA_ORIGINS: '',
    },
    // Cached transforms keep the template glob of kernel/outbox.ts from before new email files existed.
    fsModuleCache: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
