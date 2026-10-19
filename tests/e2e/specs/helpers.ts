import type { Page } from '@playwright/test';

export const PLAYER = 'http://127.0.0.1:5173';
export const PORTAL = 'http://localhost:3000';
export const API = 'http://localhost:4000';
export const PASSWORD = 'rihla-demo-2026';

export async function apiLogin(email: string): Promise<string> {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (await r.json()) as T;
}

export async function portalLogin(page: Page, email: string): Promise<void> {
  await page.goto(`${PORTAL}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(`${PORTAL}/app`);
}

/** Waits for the engine to be playable (window.rihla set and ready). */
export async function engineReady(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { rihla?: { engine?: { phase?: string } } }).rihla?.engine, null, { timeout: 120_000 });
}
