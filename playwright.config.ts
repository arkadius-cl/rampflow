import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file-if-exists=../../.env --import tsx src/server.ts',
      cwd: 'apps/api',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer,
    },
    {
      command: 'node_modules/.bin/vite',
      cwd: 'apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer,
    },
  ],
});
