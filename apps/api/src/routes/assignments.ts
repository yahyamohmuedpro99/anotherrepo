import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq } from 'drizzle-orm';
import { assignments, classes, packs, packVersions } from '../db/schema.js';
import { staff } from '../context.js';
import { ownClass } from './classes.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http.js';

export const assignmentRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config } = app.ctx;
  const link = (a: { packId: string; poiId: string | null }, joinCode: string) => `${config.playerUrl}/x/${a.packId}/${a.poiId ?? ''}?c=${joinCode}`;

  app.get('/v1/classes/:id/assignments', { schema: { tags: ['assignments'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const c = await ownClass(tx, a, req.params.id);
      const rows = await tx.select().from(assignments).where(eq(assignments.classId, c.id)).orderBy(desc(assignments.createdAt));
      return { assignments: rows.map((r) => ({ ...r, link: link(r, c.joinCode) })) };
    });
  });

  app.post(
    '/v1/classes/:id/assignments',
    {
      schema: {
        tags: ['assignments'],
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          packId: Type.String(),
          version: Type.Optional(Type.String()),
          poiId: Type.Optional(Type.String()),
          dueAt: Type.Optional(Type.String({ format: 'date-time' })),
          attemptsAllowed: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
          hints: Type.Optional(Type.Boolean()),
          preQuiz: Type.Optional(Type.Boolean()),
          postQuiz: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      const b = req.body;
      const [p] = await database.db.select().from(packs).where(eq(packs.id, b.packId));
      if (!p?.currentVersion) throw notFound('Pack not published');
      const version = b.version ?? p.currentVersion;
      const [v] = await database.db.select().from(packVersions).where(and(eq(packVersions.packId, b.packId), eq(packVersions.version, version), eq(packVersions.status, 'published')));
      if (!v) throw badRequest('version-unavailable');
      if (b.poiId && !v.pois.some((x) => x.id === b.poiId)) throw badRequest('poi-unknown');
      return database.tenant(a.tid, async (tx) => {
        const c = await ownClass(tx, a, req.params.id);
        const [row] = await tx
          .insert(assignments)
          .values({ id: newId('asg'), tenantId: a.tid, classId: c.id, packId: b.packId, packVersion: version, poiId: b.poiId ?? null, dueAt: b.dueAt ? new Date(b.dueAt) : null, attemptsAllowed: b.attemptsAllowed ?? 3, hints: b.hints ?? true, preQuiz: b.preQuiz ?? false, postQuiz: b.postQuiz ?? false, createdBy: a.sub })
          .returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'assignment.created', target: row!.id, detail: { packId: b.packId, version } });
        return { assignment: { ...row, link: link(row!, c.joinCode) } };
      });
    },
  );

  app.delete('/v1/assignments/:id', { schema: { tags: ['assignments'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [row] = await tx.select().from(assignments).where(eq(assignments.id, req.params.id));
      if (!row) throw notFound();
      await ownClass(tx, a, row.classId);
      await tx.delete(assignments).where(eq(assignments.id, row.id));
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'assignment.deleted', target: row.id });
      return { ok: true };
    });
  });

  void classes;
};
