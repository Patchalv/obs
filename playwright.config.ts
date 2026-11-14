import { defineConfig, devices } from '@playwright/test';

// The smoke suite runs against the built app (`pnpm build`, then the production server),
// on its own database, `ping_e2e`, rebuilt and seeded before every run.
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command:
      'pnpm --filter @ping/server exec tsx src/db/cli/prepare-e2e.ts && pnpm build && pnpm start',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(port),
      DATABASE_URL: 'postgres://ping_app:ping_app@localhost:6432/ping_e2e',
      SYSTEM_DATABASE_URL: 'postgres://ping_system:ping_system@localhost:6432/ping_e2e',
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: 'playwright-secret-for-the-local-e2e-database-only',
    },
  },
});
