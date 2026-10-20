import { defineConfig, devices } from '@playwright/test';

// The container gets no .env, and an unset NODE_ENV means production (apps/api/src/kernel/env.ts).
// The API server and the specs that derive tokens with the dev TOKEN_SECRET inherit this.
process.env.NODE_ENV ??= 'development';

const reuseExistingServer = !process.env.CI;
// Ports come from the e2e profile of scripts/checkout-env.mjs (dev ports + 5), so a running
// `pnpm dev` and its database are never reused.
const apiPort = Number(process.env.API_PORT ?? 3000);
const webPort = Number(process.env.WEB_PORT ?? 5173);
const driverPort = Number(process.env.DRIVER_PORT ?? 5174);
// Office screens are laid out for 1920 × 1080 (docs/explanation/ux-concept.md).
const office = { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Office and station screens of staff and carriers (U2).
    { name: 'staff', testIgnore: /(driver|core-loop|yard)\//, use: office },
    // The driver PWA on a phone (U10), through the web dev server's /d proxy.
    { name: 'driver', testMatch: /driver\//, use: { ...devices['Pixel 7'] } },
    // The core loop (U12) and the yard specs (U9) pin the one API clock that every spec shares, so
    // they run alone after the other projects, one spec at a time. Each actor opens its own
    // context and device.
    {
      name: 'core-loop',
      testMatch: /(core-loop|yard)\//,
      dependencies: ['staff', 'driver'],
      workers: 1,
      // One long story on a shared machine: a stuck step fails with its locator, not the timeout.
      expect: { timeout: 15_000 },
      use: { ...office, actionTimeout: 30_000 },
    },
  ],
  webServer: [
    {
      // Test routes seed worlds; the job runner sends the outbox to Mailpit every 5 seconds.
      // TRUST_PROXY: each driver spec sends its own X-Forwarded-For, so the exchange limit of
      // 10 per minute and address holds per spec, not for the whole run.
      command: 'node --import tsx src/server.ts',
      cwd: 'apps/api',
      url: `http://localhost:${apiPort}/api/health`,
      env: { ENABLE_TEST_ROUTES: '1', ENABLE_JOBS: '1', TRUST_PROXY: '1' },
      reuseExistingServer,
    },
    {
      // Mode e2e keeps the dev tools overlay out of screenshots and axe runs.
      command: 'node_modules/.bin/vite --mode e2e',
      cwd: 'apps/web',
      url: `http://localhost:${webPort}`,
      reuseExistingServer,
    },
    {
      command: 'node_modules/.bin/vite --mode e2e',
      cwd: 'apps/driver',
      url: `http://localhost:${driverPort}/d/`,
      reuseExistingServer,
    },
    {
      // The production build of the PWA with the /d headers, for budget and first render.
      command: 'node_modules/.bin/vite build --logLevel warn && node_modules/.bin/vite preview',
      cwd: 'apps/driver',
      url: `http://localhost:${driverPort + 1}/d/`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
