import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/client.js';
import { assignments, events, itemResults, objectiveResults, packVersions, studentProgress } from '../db/schema.js';

const BATCH = 2000;
/** Gaps longer than this are not counted as active time. */
const IDLE_MS = 60_000;

type Ev = typeof events.$inferSelect;

/**
 * Folds new learning events into the per-attempt and per-objective tables that teacher dashboards read
 * (BRIEF §9). Idempotent per event: each event is processed once (processed_at), in timestamp order.
 */
export async function aggregateEvents(database: Database): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await database.system(async (tx) => {
      const batch = await tx.select().from(events).where(isNull(events.processedAt)).orderBy(asc(events.ts)).limit(BATCH).for('update', { skipLocked: true });
      if (!batch.length) return 0;
      const touched = new Map<string, { tenantId: string; assignmentId: string; studentId: string }>();
      for (const e of batch) {
        if (!e.assignmentId || !e.studentId) continue;
        await applyEvent(tx, e);
        touched.set(`${e.assignmentId}|${e.studentId}`, { tenantId: e.tenantId, assignmentId: e.assignmentId, studentId: e.studentId });
      }
      for (const t of touched.values()) await recomputeObjectives(tx, t.tenantId, t.assignmentId, t.studentId);
      await tx.update(events).set({ processedAt: new Date() }).where(inArray(events.id, batch.map((e) => e.id)));
      return batch.length;
    });
    total += n;
    if (n < BATCH) return total;
  }
}

async function applyEvent(tx: Tx, e: Ev): Promise<void> {
  const key = { assignmentId: e.assignmentId!, studentId: e.studentId! };
  const [p] = await tx.select().from(studentProgress).where(and(eq(studentProgress.assignmentId, key.assignmentId), eq(studentProgress.studentId, key.studentId)));
  const gap = p ? e.ts.getTime() - p.lastAt.getTime() : 0;
  const active = gap > 0 && gap < IDLE_MS ? gap : 0;
  const prog = {
    lastAt: p && p.lastAt > e.ts ? p.lastAt : e.ts,
    activeMs: (p?.activeMs ?? 0) + active,
    completed: (p?.completed ?? false) || e.verb === 'completed',
    stamps: (p?.stamps ?? 0) + (e.verb === 'earned-stamp' ? 1 : 0),
    pois: (p?.pois ?? 0) + (e.verb === 'visited-poi' ? 1 : 0),
  };
  if (p) await tx.update(studentProgress).set(prog).where(and(eq(studentProgress.assignmentId, key.assignmentId), eq(studentProgress.studentId, key.studentId)));
  else await tx.insert(studentProgress).values({ tenantId: e.tenantId, ...key, firstAt: e.ts, ...prog });

  if ((e.verb !== 'answered' && e.verb !== 'hint-used') || e.objectType !== 'item') return;
  const phase = String((e.context as { phase?: string }).phase ?? 'play');
  const r = (e.result ?? {}) as { correct?: boolean; attempt?: number; response?: string; durationMs?: number };
  const [cur] = await tx
    .select()
    .from(itemResults)
    .where(and(eq(itemResults.assignmentId, key.assignmentId), eq(itemResults.studentId, key.studentId), eq(itemResults.itemId, e.objectId), eq(itemResults.phase, phase)));
  const row = cur ?? { attempts: 0, correct: false, firstTry: false, hints: 0, wrongResponses: [] as string[], durationMs: 0 };
  if (e.verb === 'hint-used') row.hints++;
  else {
    const attempt = r.attempt ?? row.attempts + 1;
    row.attempts = Math.max(row.attempts, attempt);
    if (r.correct) {
      if (!row.correct && attempt === 1) row.firstTry = true;
      row.correct = true;
    } else if (r.response) row.wrongResponses = [...row.wrongResponses, String(r.response).slice(0, 80)].slice(-10);
    row.durationMs += Math.min(r.durationMs ?? 0, 10 * 60_000);
  }
  const vals = { attempts: row.attempts, correct: row.correct, firstTry: row.firstTry, hints: row.hints, wrongResponses: row.wrongResponses, durationMs: row.durationMs, updatedAt: new Date() };
  if (cur) await tx.update(itemResults).set(vals).where(and(eq(itemResults.assignmentId, key.assignmentId), eq(itemResults.studentId, key.studentId), eq(itemResults.itemId, e.objectId), eq(itemResults.phase, phase)));
  else await tx.insert(itemResults).values({ tenantId: e.tenantId, ...key, itemId: e.objectId, phase, ...vals });
}

/** objective_results = item_results grouped by the pack version's item → objectives map. */
async function recomputeObjectives(tx: Tx, tenantId: string, assignmentId: string, studentId: string): Promise<void> {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId));
  if (!a) return;
  const [v] = await tx.select().from(packVersions).where(and(eq(packVersions.packId, a.packId), eq(packVersions.version, a.packVersion)));
  if (!v) return;
  const rows = await tx.select().from(itemResults).where(and(eq(itemResults.assignmentId, assignmentId), eq(itemResults.studentId, studentId)));
  const agg = new Map<string, { items: number; correct: number; phase: string; objectiveId: string }>();
  for (const r of rows) {
    for (const o of v.items[r.itemId]?.objectives ?? []) {
      const k = `${o}|${r.phase}`;
      const g = agg.get(k) ?? { items: 0, correct: 0, phase: r.phase, objectiveId: o };
      g.items++;
      if (r.correct) g.correct++;
      agg.set(k, g);
    }
  }
  await tx.delete(objectiveResults).where(and(eq(objectiveResults.assignmentId, assignmentId), eq(objectiveResults.studentId, studentId)));
  if (agg.size) await tx.insert(objectiveResults).values([...agg.values()].map((g) => ({ tenantId, assignmentId, studentId, ...g, updatedAt: new Date() })));
}

export const _test = { IDLE_MS, sqlNow: sql`now()` };
