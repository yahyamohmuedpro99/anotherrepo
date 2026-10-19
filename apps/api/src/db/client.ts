import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type Tx = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  /** Unscoped handle: only for tables without tenant rows (users, packs, jobs, audit). */
  db: Tx;
  /** Runs fn in a transaction where row-level security only shows this tenant's rows. */
  tenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Runs fn with row-level security bypassed: system jobs and cross-tenant lookups (code resolution). */
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  migrate(): Promise<string[]>;
  /**
   * Switch to the restricted application role. Resolves false when the role is unavailable (managed databases
   * without CREATEROLE); FORCE ROW LEVEL SECURITY still applies to the owner then (ADR-0021).
   */
  useAppRole(): Promise<boolean>;
  close(): Promise<void>;
  kind: 'pg' | 'pglite';
}

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** `postgres://…` uses node-postgres; `pglite://memory` (tests, local demo) or `pglite:///path/to/dir` uses PGlite. */
export async function createDatabase(url: string): Promise<Database> {
  let db: Tx;
  let exec: (text: string) => Promise<void>;
  let close: () => Promise<void>;
  let kind: Database['kind'];
  let appRole: () => Promise<boolean>;
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dir = url.replace(/^pglite:\/\//, '');
    const client = new PGlite(dir === 'memory' || dir === '' ? undefined : dir);
    db = drizzle(client, { schema }) as unknown as Tx;
    exec = async (text) => void (await client.exec(text));
    close = () => client.close();
    appRole = async () => {
      await client.exec('SET ROLE rihla_app');
      return true;
    };
    kind = 'pglite';
  } else {
    const pg = (await import('pg')).default;
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL ?? 10) });
    let restricted = false;
    pool.on('connect', (c) => {
      if (restricted) void c.query('SET ROLE rihla_app');
    });
    db = drizzle(pool, { schema }) as unknown as Tx;
    exec = async (text) => void (await pool.query(text));
    close = () => pool.end();
    appRole = async () => {
      // connections already in the pool switch too
      const ok = await pool.query('SET ROLE rihla_app').then(
        () => true,
        () => false,
      );
      restricted = ok;
      return ok;
    };
    kind = 'pg';
  }
  const scoped = <T>(key: 'rihla.tenant_id' | 'rihla.bypass', value: string, fn: (tx: Tx) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${key}, ${value}, true)`);
      return fn(tx as unknown as Tx);
    });
  return {
    db,
    kind,
    tenant: (tenantId, fn) => scoped('rihla.tenant_id', tenantId, fn),
    system: (fn) => scoped('rihla.bypass', 'on', fn),
    async migrate() {
      await exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const done = new Set(((await db.execute(sql`select name from schema_migrations`)) as unknown as { rows: { name: string }[] }).rows.map((r) => r.name));
      const applied: string[] = [];
      for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
        if (done.has(f)) continue;
        await exec(`BEGIN;\n${readFileSync(path.join(MIGRATIONS, f), 'utf8')}\nINSERT INTO schema_migrations (name) VALUES ('${f}');\nCOMMIT;`);
        applied.push(f);
      }
      return applied;
    },
    useAppRole: appRole,
    close,
  };
}
