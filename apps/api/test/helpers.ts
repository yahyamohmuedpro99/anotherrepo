import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { seed } from '../src/seed.js';

export interface Harness {
  app: FastifyInstance;
  database: Database;
  config: Config;
  seeded: NonNullable<Awaited<ReturnType<typeof seed>>>;
  call: (method: string, url: string, token?: string | null, payload?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; text: string; headers: Record<string, unknown> }>;
  login: (email: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function harness(): Promise<Harness> {
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-jwt', ROOM_TOKEN_SECRET: 'test-room', INTERNAL_SECRET: 'test-internal', STORAGE_DIR: mkdtempSync(path.join(tmpdir(), 'rihla-store-')), PLAYER_URL: 'https://play.test', SHORT_URL: 'https://r.test' });
  const database = await createDatabase('pglite://memory');
  await database.migrate();
  // run as the restricted role so row-level security is active in every test
  await database.useAppRole();
  const seeded = (await seed(database, config))!;
  const app = await buildApp({ database, config });
  const call: Harness['call'] = async (method, url, token, payload, headers = {}) => {
    const r = await app.inject({ method: method as 'GET', url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
    let body: unknown = null;
    try {
      body = r.json();
    } catch {
      /* not JSON */
    }
    return { status: r.statusCode, body, text: r.body, headers: r.headers as Record<string, unknown> };
  };
  const login = async (email: string) => {
    const r = await call('POST', '/v1/auth/login', null, { email, password: 'rihla-demo-2026' });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.text}`);
    return r.body.accessToken as string;
  };
  return { app, database, config, seeded, call, login, close: async () => (await app.close(), await database.close()) };
}

let n = 0;
export function answered(itemId: string, correct: boolean, attempt: number, extra: { assignmentId?: string; phase?: string; response?: string; ts?: Date } = {}) {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    verb: 'answered',
    ts: (extra.ts ?? new Date()).toISOString(),
    actor: { deviceId: 'dev-1' },
    object: { type: 'item', id: itemId },
    result: { correct, attempt, ...(extra.response ? { response: extra.response } : {}), durationMs: 9000 },
    context: { packId: 'giza-plateau', packVersion: '1.0.0', locale: 'ar-EG', mode: 'student', ...(extra.assignmentId ? { assignmentId: extra.assignmentId } : {}), phase: extra.phase ?? 'play' },
  };
}
export function verb(v: string, objectType: string, id: string, extra: Record<string, unknown> = {}) {
  n++;
  return { id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`, verb: v, ts: new Date().toISOString(), actor: { deviceId: 'dev-1' }, object: { type: objectType, id }, context: { packId: 'giza-plateau', packVersion: '1.0.0', locale: 'ar-EG', mode: 'guest', ...extra } };
}
