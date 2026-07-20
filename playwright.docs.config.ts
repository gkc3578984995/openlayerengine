import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser-docs',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4194',
    headless: true,
    viewport: { width: 1_280, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev --workspace=ol-doc -- --host 127.0.0.1 --port 4194',
    url: 'http://127.0.0.1:4194',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
