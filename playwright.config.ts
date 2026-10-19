import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;
// Ports come from the environment so parallel checkouts do not collide (scripts/checkout-env.mjs).
const apiPort = Number(process.env.API_PORT ?? 3000);
const webPort = Number(process.env.WEB_PORT ?? 5173);

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
    // Office and station screens of staff and carriers (U2). U10 adds the Pixel 7 driver project.
    { name: 'staff', testIgnore: /driver\//, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Test routes seed worlds; the job runner sends the outbox to Mailpit every 5 seconds.
      command: 'node --import tsx src/server.ts',
      cwd: 'apps/api',
      url: `http://localhost:${apiPort}/api/health`,
      env: { ENABLE_TEST_ROUTES: '1', ENABLE_JOBS: '1' },
      reuseExistingServer,
    },
    {
      // Mode e2e keeps the dev tools overlay out of screenshots and axe runs.
      command: 'node_modules/.bin/vite --mode e2e',
      cwd: 'apps/web',
      url: `http://localhost:${webPort}`,
      reuseExistingServer,
    },
  ],
});
