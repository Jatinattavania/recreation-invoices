import { defineConfig } from '@playwright/test';

// End-to-end tests run in your installed Google Chrome against a dev server on
// port 4317, so they never touch your real data on localhost:8080.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317',
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npx vite --port 4317 --strictPort --open false',
    url: 'http://localhost:4317',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
