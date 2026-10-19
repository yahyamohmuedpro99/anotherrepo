import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CI = !!process.env.CI;
const db = `pglite://${mkdtempSync(path.join(tmpdir(), 'rihla-e2e-db-'))}`;
const secrets = { JWT_SECRET: 'e2e-jwt', ROOM_TOKEN_SECRET: 'e2e-room', INTERNAL_SECRET: 'e2e-internal' };

/**
 * End-to-end flows (BRIEF §18): QR scan to first interaction, teacher assign to report, publisher batch to
 * download, accessibility on portal pages, and a low-tier performance smoke on both packs.
 * Locally it reuses servers you already run; in CI it starts the API (PGlite, seeded), player and portal.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 1280, height: 760 },
    launchOptions: {
      ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    trace: 'retain-on-failure',
    // the player ships a strict CSP (no eval); Playwright's waitForFunction polling needs eval in tests
    bypassCSP: true,
  },
  webServer: [
    {
      command: 'pnpm --filter @rihla/api demo',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !CI,
      timeout: 180_000,
      env: { DATABASE_URL: db, PLAYER_URL: 'http://localhost:5173', PORTAL_URL: 'http://localhost:3000', SHORT_URL: 'http://localhost:4000/s', ...secrets },
    },
    { command: 'pnpm --filter @rihla/player exec vite --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173/', reuseExistingServer: !CI, timeout: 120_000 },
    { command: 'pnpm --filter @rihla/portal dev', url: 'http://localhost:3000/', reuseExistingServer: !CI, timeout: 240_000, env: { API_URL: 'http://localhost:4000', NEXT_PUBLIC_PLAYER_URL: 'http://127.0.0.1:5173' } },
  ],
});
