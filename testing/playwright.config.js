// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,          // per-test timeout
  retries: 1,               // one retry on CI
  workers: 4,               // 4 parallel workers = 4 spec files simultaneously

  // globalSetup/Teardown disabled — backend started manually via jbang
  // globalSetup:    './global-setup.js',
  // globalTeardown: './global-teardown.js',

  use: {
    baseURL: process.env.PG_BASE_URL || 'http://localhost:8080',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
