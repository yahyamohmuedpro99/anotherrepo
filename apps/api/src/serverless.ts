/**
 * The API as one serverless function (Vercel, ADR-0022). Each instance boots once: migrations and the demo seed
 * run under a Postgres advisory lock so concurrent cold starts do not race, published packs are rebuilt into
 * /tmp, and work that a worker process would do runs inside requests instead.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase, type Database } from './db/client.js';
import { restorePacks } from './lib/restore-packs.js';
import { aggregateEvents, handlers, runOne } from './jobs/index.js';

const BOOT_LOCK = 724_201;

async function boot(): Promise<FastifyInstance> {
  if (process.env.RIHLA_BUNDLED === '1') {
    // tools/vercel/build.mjs ships the pack folders next to the bundle; only /tmp is writable
    process.env.PACKS_SOURCE_DIR ??= fileURLToPath(new URL('./packs', import.meta.url));
    process.env.STORAGE_DIR ??= '/tmp/rihla-packs';
  }
  // Neon (Vercel Marketplace) also offers a pooled URL; SET ROLE needs a direct session
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  // on Vercel the public URL is known without configuration
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) {
    process.env.PLAYER_URL ??= `https://${host}`;
    process.env.SHORT_URL ??= `https://${host}/s`;
  }
  const database = await createDatabase(process.env.DATABASE_URL ?? 'pglite://memory');
  let config!: ReturnType<typeof loadConfig>;
  await withLock(database, async () => {
    await database.migrate();
    await loadInstanceSecrets(database);
    config = loadConfig();
    if (process.env.SEED_DEMO === '1') {
      const { seed } = await import('./seed.js');
      await seed(database, config);
    }
  });
  const appRole = process.env.DB_APP_ROLE !== '0' && (await database.useAppRole());
  const app = await buildApp({ database, config, logger: true });
  if (!appRole) app.log.warn('running as the database owner role: rihla_app is not available');
  if (process.env.PACKS_SOURCE_DIR) await restorePacks(database, config.storageDir, process.env.PACKS_SOURCE_DIR, (m) => app.log.info(m));

  // No worker process: fold new learning events in before anything that reads results, and run a few due jobs.
  app.addHook('onRequest', async (req) => {
    if (req.method !== 'GET' || !/^\/v1\/(assignments|classes|books|publisher|reports)/.test(req.url)) return;
    await aggregateEvents(database);
    for (let i = 0; i < 3 && (await runOne(database, handlers, 'request')); i++);
  });
  await app.ready();
  return app;
}

/**
 * Signing secrets for hosts where nobody configured them: generated once, kept in the database (owner role only),
 * shared by every instance. Configured environment variables always win.
 */
async function loadInstanceSecrets(database: Database): Promise<void> {
  for (const name of ['JWT_SECRET', 'ROOM_TOKEN_SECRET', 'INTERNAL_SECRET']) {
    if (process.env[name]) continue;
    await database.db.execute(sql`insert into instance_secrets (name, value) values (${name}, ${randomBytes(32).toString('hex')}) on conflict (name) do nothing`);
    const r = (await database.db.execute(sql`select value from instance_secrets where name = ${name}`)) as unknown as { rows: { value: string }[] };
    process.env[name] = r.rows[0]!.value;
  }
}

/** Serialises boot work across instances; the lock is held by one transaction while the work runs. */
async function withLock(database: Database, fn: () => Promise<void>): Promise<void> {
  if (database.kind === 'pglite') return fn();
  await database.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOT_LOCK})`);
    await fn();
  });
}

let ready: Promise<FastifyInstance> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= boot().catch((err) => {
    ready = null;
    throw err;
  });
  const app = await ready;
  // the function is mounted at /api on the player's domain; routes live at the root
  req.url = (req.url ?? '/').replace(/^\/api(?=\/|\?|$)/, '') || '/';
  app.server.emit('request', req, res);
}
