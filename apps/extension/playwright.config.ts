import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  webServer: {
    command: '../api/scripts/e2e-serve.sh',
    url: 'http://127.0.0.1:8000/up',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
