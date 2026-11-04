import { defineConfig, devices } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', ...devices['Desktop Chrome'] },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'pnpm --filter api start',
      cwd: root,
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://trail:trail@127.0.0.1:5432/trail_steward',
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'dev-jwt-secret-change-me',
        RESEND_API_KEY: 're_test_local',
        EMAIL_FROM: 'Trail Steward <noreply@example.com>',
        APP_BASE_URL: 'http://127.0.0.1:5173',
        API_BASE_URL: 'http://127.0.0.1:3000',
        TZ: 'America/Anchorage',
        PORT: '3000',
      },
    },
    {
      command: 'pnpm --filter web exec vite --host 127.0.0.1 --port 5173',
      cwd: root,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
