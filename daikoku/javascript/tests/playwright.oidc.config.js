import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 90_000,
  expect: {
    timeout: 5000
  },
  testDir: './specs-oidc',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    actionTimeout: 5000,
    navigationTimeout: 5000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
