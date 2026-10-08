import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testMatch: 'rfs-pwa-update.spec.ts', timeout: 120000, retries: 0, workers: 1,
  outputDir: 'test-results-pwa',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/pwa-fixture-server.mjs', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 30000 },
});
