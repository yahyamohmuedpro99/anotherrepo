import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/client.js';
import { jobs } from '../db/schema.js';

/**
 * A small Postgres job queue (ADR-0006). Jobs are claimed with FOR UPDATE SKIP LOCKED, so any number of
 * worker processes can run. A dedupe key keeps at most one *pending* job per key (e.g. one aggregation run).
 */
export async function enqueue(tx: Tx, kind: string, payload: Record<string, unknown> = {}, opts: { dedupeKey?: string; runAt?: Date } = {}): Promise<void> {
  await tx
    .insert(jobs)
    .values({ kind, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey ?? null })
    .onConflictDoNothing({ target: jobs.dedupeKey });
}

export type JobHandler = (database: Database, payload: Record<string, unknown>) => Promise<void>;

const STALE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

/** Claims and runs one ready job. Returns false when the queue had nothing to do. */
export async function runOne(database: Database, handlers: Record<string, JobHandler>, worker: string): Promise<boolean> {
  const job = await database.system(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT id FROM jobs
      WHERE done_at IS NULL AND run_at <= now() AND attempts < ${MAX_ATTEMPTS}
        AND (locked_at IS NULL OR locked_at < now() - make_interval(secs => ${STALE_MS / 1000}))
        AND kind = ANY(${sql.raw(`ARRAY[${Object.keys(handlers).map((k) => `'${k.replace(/'/g, "''")}'`).join(',') || "''"}]::text[]`)})
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1`)) as unknown as { rows: { id: number | string }[] };
    const id = rows.rows[0]?.id;
    if (id === undefined) return null;
    const [j] = await tx.update(jobs).set({ lockedAt: new Date(), lockedBy: worker, attempts: sql`${jobs.attempts} + 1` }).where(eq(jobs.id, Number(id))).returning();
    return j ?? null;
  });
  if (!job) return false;
  try {
    await handlers[job.kind]!(database, job.payload);
    await database.system((tx) => tx.update(jobs).set({ doneAt: new Date(), dedupeKey: null, error: null }).where(eq(jobs.id, job.id)));
  } catch (err) {
    const backoff = Math.min(3600, 15 * 2 ** job.attempts);
    await database.system((tx) =>
      tx
        .update(jobs)
        .set({ lockedAt: null, lockedBy: null, error: String((err as Error).stack ?? err).slice(0, 2000), runAt: new Date(Date.now() + backoff * 1000), ...(job.attempts >= MAX_ATTEMPTS ? { dedupeKey: null } : {}) })
        .where(eq(jobs.id, job.id)),
    );
  }
  return true;
}

/** Drains the queue (tests, one-shot CLI runs). */
export async function drain(database: Database, handlers: Record<string, JobHandler>, max = 1000): Promise<number> {
  let n = 0;
  while (n < max && (await runOne(database, handlers, 'drain'))) n++;
  return n;
}

export async function pendingJobs(database: Database, kind?: string): Promise<number> {
  const rows = await database.system((tx) => tx.select({ id: jobs.id }).from(jobs).where(and(isNull(jobs.doneAt), lte(jobs.runAt, new Date()), kind ? eq(jobs.kind, kind) : undefined)));
  return rows.length;
}
