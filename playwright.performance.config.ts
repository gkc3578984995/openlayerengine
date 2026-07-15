import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.performance.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4177',
    headless: true,
    viewport: { width: 1_280, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npx vite --config test/browser/vite.config.ts',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
