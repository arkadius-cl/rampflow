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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: 'apps/api',
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer,
    },
    {
      command: 'node_modules/.bin/vite',
      cwd: 'apps/web',
      url: `http://localhost:${webPort}`,
      reuseExistingServer,
    },
  ],
});
