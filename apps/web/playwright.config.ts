import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_START_SERVERS === 'true' ? [
    { command: 'npm run start:dev -w @sih/api', port: 3001, reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -w @sih/web', port: 3000, reuseExistingServer: !process.env.CI },
  ] : undefined,
});
