import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { auditLog, classes, consentRecords, dataRequests, students } from '../db/schema.js';
import { isAdmin, staff } from '../context.js';
import { ownClass } from './classes.js';
import { enqueue } from '../jobs/queue.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/http.js';

/** Consent records, data export/deletion and the audit log (BRIEF §11). */
export const complianceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database } = app.ctx;

  app.post(
    '/v1/students/:id/consent',
    { schema: { tags: ['compliance'], params: Type.Object({ id: Type.String() }), body: Type.Object({ givenBy: Type.String({ minLength: 1, maxLength: 120 }), evidence: Type.String({ minLength: 1, maxLength: 500, description: 'Where the school keeps the signed form' }), kind: Type.Optional(Type.String()) }) } },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      return database.tenant(a.tid, async (tx) => {
        const [s] = await tx.select().from(students).where(eq(students.id, req.params.id));
        if (!s) throw notFound('Student not found');
        await ownClass(tx, a, s.classId);
        const [c] = await tx.insert(consentRecords).values({ id: newId('con'), tenantId: a.tid, studentId: s.id, kind: req.body.kind ?? 'parental', givenBy: req.body.givenBy, evidence: req.body.evidence, recordedBy: a.sub }).returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'consent.recorded', target: s.id });
        return { consent: c };
      });
    },
  );

  app.get('/v1/classes/:id/consent', { schema: { tags: ['compliance'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      await ownClass(tx, a, req.params.id);
      const rows = await tx
        .select({ studentId: students.id, name: students.displayName, consentId: consentRecords.id, recordedAt: consentRecords.recordedAt })
        .from(students)
        .leftJoin(consentRecords, and(eq(consentRecords.studentId, students.id), isNull(consentRecords.withdrawnAt)))
        .where(eq(students.classId, req.params.id));
      return { students: rows.map((r) => ({ id: r.studentId, name: r.name, consent: !!r.consentId, recordedAt: r.recordedAt })) };
    });
  });

  /** Export or delete one student, a class roster or the whole tenant; runs as a job, audited. */
  app.post(
    '/v1/data-requests',
    {
      schema: {
        tags: ['compliance'],
        body: Type.Object({ subjectKind: Type.Union([Type.Literal('student'), Type.Literal('class'), Type.Literal('tenant')]), subjectId: Type.String(), kind: Type.Union([Type.Literal('export'), Type.Literal('delete')]) }),
      },
    },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      const b = req.body;
      if (b.subjectKind === 'tenant' && (!isAdmin(a) || b.subjectId !== a.tid)) throw forbidden('Only a school admin can request this for their own school');
      const r = await database.tenant(a.tid, async (tx) => {
        if (b.subjectKind === 'student') {
          const [s] = await tx.select().from(students).where(eq(students.id, b.subjectId));
          if (!s) throw notFound('Student not found');
          await ownClass(tx, a, s.classId);
        }
        if (b.subjectKind === 'class') await ownClass(tx, a, b.subjectId);
        const [row] = await tx.insert(dataRequests).values({ id: newId('dsr'), tenantId: a.tid, subjectKind: b.subjectKind, subjectId: b.subjectId, kind: b.kind, requestedBy: a.sub }).returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: `data.${b.kind}-requested`, target: `${b.subjectKind}:${b.subjectId}` });
        return row!;
      });
      await database.system((tx) => enqueue(tx, 'data-request', { id: r.id }));
      return { request: r };
    },
  );

  app.get('/v1/data-requests', { schema: { tags: ['compliance'] } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => ({
      requests: await tx
        .select({ id: dataRequests.id, subjectKind: dataRequests.subjectKind, subjectId: dataRequests.subjectId, kind: dataRequests.kind, status: dataRequests.status, createdAt: dataRequests.createdAt, doneAt: dataRequests.doneAt })
        .from(dataRequests)
        .where(isAdmin(a) ? undefined : eq(dataRequests.requestedBy, a.sub))
        .orderBy(desc(dataRequests.createdAt)),
    }));
  });

  app.get('/v1/data-requests/:id', { schema: { tags: ['compliance'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [r] = await tx.select().from(dataRequests).where(eq(dataRequests.id, req.params.id));
      if (!r) throw notFound();
      if (!isAdmin(a) && r.requestedBy !== a.sub) throw forbidden();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'data.export-read', target: r.id });
      return { request: r };
    });
  });

  /** Removing a student from a class deletes their data (via a delete request). */
  app.delete('/v1/students/:id', { schema: { tags: ['compliance'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    const r = await database.tenant(a.tid, async (tx) => {
      const [s] = await tx.select().from(students).where(eq(students.id, req.params.id));
      if (!s) throw notFound('Student not found');
      await ownClass(tx, a, s.classId);
      const [row] = await tx.insert(dataRequests).values({ id: newId('dsr'), tenantId: a.tid, subjectKind: 'student', subjectId: s.id, kind: 'delete', requestedBy: a.sub }).returning();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'student.removed', target: s.id });
      return row!;
    });
    await database.system((tx) => enqueue(tx, 'data-request', { id: r.id }));
    return { request: r };
  });

  app.get('/v1/audit', { schema: { tags: ['compliance'], querystring: Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })) }) } }, async (req) => {
    const a = staff(req, 'school_admin', 'publisher_admin');
    const platform = a.roles.includes('platform_admin');
    const rows = await database.db
      .select()
      .from(auditLog)
      .where(platform ? undefined : eq(auditLog.tenantId, a.tid))
      .orderBy(desc(auditLog.id))
      .limit(req.query.limit ?? 100);
    return { entries: rows };
  });

  void classes;
};
