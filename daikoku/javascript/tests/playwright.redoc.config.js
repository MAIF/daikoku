import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs-redoc',
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5174',
  },
  webServer: {
    command:
      '../node_modules/.bin/vite .. --config ../vite.config.ts --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174/tests/fixtures/redoc/index.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
