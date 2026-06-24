import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 90_000,
  expect: {
    timeout: 5000
  },
  testDir: './specs-local',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    actionTimeout: 5000,
    navigationTimeout: 5000,
    trace: 'on-first-retry',
    baseURL: !!process.env.CI ? "http://localhost:13200" : "http://localhost:5173"
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
