import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { assignments, itemResults, objectiveResults, packVersions, packs, studentProgress, students } from '../db/schema.js';
import { staff } from '../context.js';
import { ownClass } from './classes.js';
import { notFound } from '../lib/http.js';

export interface Report {
  assignment: typeof assignments.$inferSelect;
  pack: { id: string; version: string; title: Record<string, string> };
  objectives: { id: string; text: Record<string, string>; pre: number | null; play: number | null; post: number | null }[];
  students: {
    id: string;
    name: string;
    completed: boolean;
    activeMinutes: number;
    lastAt: string | null;
    stamps: number;
    hints: number;
    objectives: Record<string, { correct: number; items: number }>;
    pre: number | null;
    post: number | null;
  }[];
  items: { id: string; prompt: Record<string, string>; answered: number; correctRate: number | null; firstTryRate: number | null; commonWrong: { response: string; n: number }[] }[];
}

const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : null);

/** Built only from the aggregate tables (BRIEF §9): never from raw events. */
export async function buildReport(app: { ctx: { database: import('../db/client.js').Database } }, req: FastifyRequest, assignmentId: string): Promise<Report> {
  const a = staff(req, 'teacher', 'school_admin');
  const { database } = app.ctx;
  return database.tenant(a.tid, async (tx) => {
    const [asg] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId));
    if (!asg) throw notFound('Assignment not found');
    await ownClass(tx, a, asg.classId);
    const [v] = await tx.select().from(packVersions).where(and(eq(packVersions.packId, asg.packId), eq(packVersions.version, asg.packVersion)));
    const [p] = await tx.select().from(packs).where(eq(packs.id, asg.packId));
    const roster = await tx.select().from(students).where(eq(students.classId, asg.classId));
    const prog = await tx.select().from(studentProgress).where(eq(studentProgress.assignmentId, asg.id));
    const objs = await tx.select().from(objectiveResults).where(eq(objectiveResults.assignmentId, asg.id));
    const items = await tx.select().from(itemResults).where(eq(itemResults.assignmentId, asg.id));
    const objectiveDefs = v?.objectives ?? [];
    const phaseScore = (studentId: string | null, objectiveId: string | null, phase: string) => {
      let c = 0, n = 0;
      for (const o of objs) {
        if (o.phase !== phase || (studentId && o.studentId !== studentId) || (objectiveId && o.objectiveId !== objectiveId)) continue;
        c += o.correct;
        n += o.items;
      }
      return pct(c, n);
    };
    const itemIds = [...new Set(items.map((i) => i.itemId))];
    return {
      assignment: asg,
      pack: { id: asg.packId, version: asg.packVersion, title: p?.title ?? {} },
      objectives: objectiveDefs.map((o) => ({ id: o.id, text: o.text, pre: phaseScore(null, o.id, 'pre'), play: phaseScore(null, o.id, 'play'), post: phaseScore(null, o.id, 'post') })),
      students: roster
        .map((s) => {
          const pr = prog.find((x) => x.studentId === s.id);
          const mine = objs.filter((o) => o.studentId === s.id && o.phase === 'play');
          return {
            id: s.id,
            name: s.displayName,
            completed: pr?.completed ?? false,
            activeMinutes: Math.round((pr?.activeMs ?? 0) / 60000),
            lastAt: pr?.lastAt.toISOString() ?? null,
            stamps: pr?.stamps ?? 0,
            hints: items.filter((i) => i.studentId === s.id).reduce((n, i) => n + i.hints, 0),
            objectives: Object.fromEntries(mine.map((o) => [o.objectiveId, { correct: o.correct, items: o.items }])),
            pre: phaseScore(s.id, null, 'pre'),
            post: phaseScore(s.id, null, 'post'),
          };
        })
        .sort((x, y) => x.name.localeCompare(y.name, 'ar')),
      items: itemIds.map((id) => {
        const rows = items.filter((i) => i.itemId === id && i.phase === 'play');
        const wrong = new Map<string, number>();
        for (const r of rows) for (const w of r.wrongResponses) wrong.set(w, (wrong.get(w) ?? 0) + 1);
        return {
          id,
          prompt: v?.items[id]?.prompt ?? {},
          answered: rows.length,
          correctRate: pct(rows.filter((r) => r.correct).length, rows.length),
          firstTryRate: pct(rows.filter((r) => r.firstTry).length, rows.length),
          commonWrong: [...wrong].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([response, n]) => ({ response, n })),
        };
      }),
    };
  });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // neutralise spreadsheet formulas and quote everything
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function reportCsv(r: Report, locale = 'ar'): string {
  const lang = locale.startsWith('ar') ? 'ar-EG' : 'en';
  const head = ['student', 'completed', 'active_minutes', 'stamps', 'hints', 'pre_%', 'post_%', ...r.objectives.map((o) => `${o.id} (${o.text[lang] ?? o.id})`)];
  const lines = r.students.map((s) => [s.name, s.completed ? 'yes' : 'no', s.activeMinutes, s.stamps, s.hints, s.pre ?? '', s.post ?? '', ...r.objectives.map((o) => {
    const x = s.objectives[o.id];
    return x ? `${x.correct}/${x.items}` : '';
  })]);
  // BOM so Excel opens Arabic names correctly
  return '﻿' + [head, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const reportRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/v1/assignments/:id/report', { schema: { tags: ['reports'], params: Type.Object({ id: Type.String() }) } }, async (req) => buildReport(app, req, req.params.id));
  app.get('/v1/assignments/:id/report.csv', { schema: { tags: ['reports'], params: Type.Object({ id: Type.String() }), querystring: Type.Object({ lang: Type.Optional(Type.String()) }) } }, async (req, reply) => {
    const r = await buildReport(app, req, req.params.id);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="report-${r.assignment.id}.csv"`);
    return reportCsv(r, req.query.lang);
  });
};
