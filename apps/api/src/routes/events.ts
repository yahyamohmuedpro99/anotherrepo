import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq, sql } from 'drizzle-orm';
import { LEARNING_VERBS } from '@rihla/pack-schema';
import { assignments, codeDailyCounts, events, packDailyCounts, qrCodes, students } from '../db/schema.js';
import { enqueue } from '../jobs/queue.js';
import { tooMany } from '../lib/http.js';

const Event = Type.Object({
  id: Type.String({ format: 'uuid' }),
  verb: Type.Union(LEARNING_VERBS.map((v) => Type.Literal(v))),
  ts: Type.String({ format: 'date-time' }),
  actor: Type.Object({}, { additionalProperties: true }),
  object: Type.Object({ type: Type.String({ maxLength: 20 }), id: Type.String({ maxLength: 120 }) }),
  result: Type.Optional(
    Type.Object({
      correct: Type.Optional(Type.Boolean()),
      attempt: Type.Optional(Type.Integer()),
      response: Type.Optional(Type.String({ maxLength: 200 })),
      score: Type.Optional(Type.Number()),
      durationMs: Type.Optional(Type.Integer()),
      hints: Type.Optional(Type.Integer()),
    }),
  ),
  context: Type.Object(
    {
      packId: Type.String({ maxLength: 80 }),
      packVersion: Type.String({ maxLength: 20 }),
      locale: Type.String({ maxLength: 12 }),
      sceneId: Type.Optional(Type.String()),
      assignmentId: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
      objectives: Type.Optional(Type.Array(Type.String())),
      mode: Type.String(),
      phase: Type.Optional(Type.String()),
      code: Type.Optional(Type.String({ maxLength: 16 })),
      tier: Type.Optional(Type.String()),
    },
    { additionalProperties: true },
  ),
});

const day = (iso: string) => iso.slice(0, 10);

/**
 * Learning events. Students' events are stored (xAPI-like, BRIEF §9). Guests' events are only counted per
 * pack and day, and per printed code for publishers: no device id or anything else reaches the database.
 */
export const eventRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, limits } = app.ctx;
  app.post('/v1/events', { schema: { tags: ['events'], security: [], body: Type.Object({ events: Type.Array(Event, { maxItems: 200 }) }) } }, async (req) => {
    if (!limits.events.take(req.ip)) throw tooMany();
    const a = req.auth;
    const list = req.body.events;
    if (a?.kind === 'student') {
      await database.tenant(a.tid, async (tx) => {
        const [s] = await tx.select({ id: students.id, classId: students.classId }).from(students).where(eq(students.id, a.sub));
        if (!s) return;
        const ownAssignments = new Set((await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.classId, s.classId))).map((r) => r.id));
        const rows = list.map((e) => ({
          id: e.id,
          tenantId: a.tid,
          studentId: s.id,
          ts: new Date(Math.min(Date.parse(e.ts), Date.now() + 60_000)),
          verb: e.verb,
          packId: e.context.packId,
          packVersion: e.context.packVersion,
          objectType: e.object.type,
          objectId: e.object.id,
          result: e.result ?? null,
          context: { locale: e.context.locale, mode: e.context.mode, ...(e.context.phase ? { phase: e.context.phase } : {}), ...(e.context.sceneId ? { sceneId: e.context.sceneId } : {}), ...(e.context.objectives ? { objectives: e.context.objectives } : {}), ...(e.context.tier ? { tier: e.context.tier } : {}) },
          // an assignment id from another class is dropped, never trusted
          assignmentId: e.context.assignmentId && ownAssignments.has(e.context.assignmentId) ? e.context.assignmentId : null,
          sessionId: e.context.sessionId ?? null,
        }));
        if (rows.length) await tx.insert(events).values(rows).onConflictDoNothing({ target: events.id });
      });
      await database.system((tx) => enqueue(tx, 'aggregate', {}, { dedupeKey: 'aggregate', runAt: new Date(Date.now() + 15_000) }));
      return { accepted: list.length };
    }
    // guest: counts only
    await database.system(async (tx) => {
      const counts = new Map<string, { day: string; packId: string; verb: string; n: number }>();
      for (const e of list) {
        const k = `${day(e.ts)}|${e.context.packId}|${e.verb}`;
        const c = counts.get(k) ?? { day: day(e.ts), packId: e.context.packId, verb: e.verb, n: 0 };
        c.n++;
        counts.set(k, c);
      }
      for (const c of counts.values())
        await tx
          .insert(packDailyCounts)
          .values(c)
          .onConflictDoUpdate({ target: [packDailyCounts.day, packDailyCounts.packId, packDailyCounts.verb], set: { n: sql`${packDailyCounts.n} + ${c.n}` } });
      for (const e of list) {
        if (e.verb !== 'completed' || !e.context.code) continue;
        const [q] = await tx.select({ code: qrCodes.code }).from(qrCodes).where(and(eq(qrCodes.code, e.context.code.toLowerCase())));
        if (q)
          await tx
            .insert(codeDailyCounts)
            .values({ code: q.code, day: day(e.ts), completions: 1 })
            .onConflictDoUpdate({ target: [codeDailyCounts.code, codeDailyCounts.day], set: { completions: sql`${codeDailyCounts.completions} + 1` } });
      }
    });
    return { accepted: list.length };
  });
};
