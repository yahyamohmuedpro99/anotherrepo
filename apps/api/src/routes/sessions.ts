import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { assignments, classes, liveSessions, moderationLog, students, users } from '../db/schema.js';
import { staff, student } from '../context.js';
import { ownClass } from './classes.js';
import { signRoom } from '../auth/tokens.js';
import { colorFor } from './join.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/http.js';

/** Live class trips (BRIEF §10): the API issues short-lived room tokens; apps/rooms enforces them. */
export const sessionRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config } = app.ctx;

  async function teacherToken(s: typeof liveSessions.$inferSelect, userId: string) {
    const [u] = await database.db.select().from(users).where(eq(users.id, userId));
    return signRoom({ kind: 'room', sub: userId, sid: s.id, tid: s.tenantId, cid: s.classId, role: 'teacher', name: u?.name ?? 'Teacher', color: '#e9b44c', chat: s.chatEnabled }, config.roomSecret);
  }

  app.post(
    '/v1/sessions',
    { schema: { tags: ['sessions'], body: Type.Object({ classId: Type.String(), assignmentId: Type.Optional(Type.String()), chatEnabled: Type.Optional(Type.Boolean()) }) } },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      const s = await database.tenant(a.tid, async (tx) => {
        const c = await ownClass(tx, a, req.body.classId);
        if (req.body.assignmentId) {
          const [asg] = await tx.select().from(assignments).where(and(eq(assignments.id, req.body.assignmentId), eq(assignments.classId, c.id)));
          if (!asg) throw notFound('Assignment not in this class');
        }
        await tx.update(liveSessions).set({ status: 'ended', endedAt: new Date() }).where(and(eq(liveSessions.classId, c.id), eq(liveSessions.status, 'active')));
        // free-text chat stays off unless the class allows it and the teacher turns it on (BRIEF §10)
        const [row] = await tx
          .insert(liveSessions)
          .values({ id: newId('ses'), tenantId: a.tid, classId: c.id, assignmentId: req.body.assignmentId ?? null, teacherId: a.sub, chatEnabled: !!req.body.chatEnabled && c.chatAllowed })
          .returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'session.started', target: row!.id });
        return row!;
      });
      return { session: s, roomToken: await teacherToken(s, a.sub) };
    },
  );

  app.get('/v1/sessions/:id', { schema: { tags: ['sessions'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [s] = await tx.select().from(liveSessions).where(eq(liveSessions.id, req.params.id));
      if (!s) throw notFound();
      await ownClass(tx, a, s.classId);
      const roster = await tx.select({ id: students.id, name: students.displayName, nameStatus: students.nameStatus }).from(students).where(eq(students.classId, s.classId));
      return { session: s, roster, roomToken: s.status === 'active' ? await teacherToken(s, a.sub) : null };
    });
  });

  app.post('/v1/sessions/:id/end', { schema: { tags: ['sessions'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [s] = await tx.select().from(liveSessions).where(eq(liveSessions.id, req.params.id));
      if (!s) throw notFound();
      await ownClass(tx, a, s.classId);
      await tx.update(liveSessions).set({ status: 'ended', endedAt: new Date() }).where(eq(liveSessions.id, s.id));
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'session.ended', target: s.id });
      return { ok: true };
    });
  });

  app.get('/v1/sessions/:id/moderation', { schema: { tags: ['sessions'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [s] = await tx.select().from(liveSessions).where(eq(liveSessions.id, req.params.id));
      if (!s) throw notFound();
      await ownClass(tx, a, s.classId);
      return { log: await tx.select().from(moderationLog).where(eq(moderationLog.sessionId, s.id)).orderBy(desc(moderationLog.at)) };
    });
  });

  /** A student who joined before the teacher started the session asks for a room token. */
  app.get('/v1/student/room', { schema: { tags: ['sessions'] } }, async (req) => {
    const st = student(req);
    return database.tenant(st.tid, async (tx) => {
      const [s] = await tx.select().from(liveSessions).where(and(eq(liveSessions.classId, st.cid), eq(liveSessions.status, 'active'))).orderBy(desc(liveSessions.startedAt)).limit(1);
      if (!s) return { roomToken: null };
      const [me] = await tx.select().from(students).where(eq(students.id, st.sub));
      if (!me) throw forbidden();
      const name = me.nameStatus === 'approved' ? me.displayName : '…';
      return { roomToken: await signRoom({ kind: 'room', sub: me.id, sid: s.id, tid: s.tenantId, cid: s.classId, role: 'student', name, color: colorFor(me.id), chat: s.chatEnabled }, config.roomSecret), sessionId: s.id };
    });
  });

  // ---- service-to-service (apps/rooms) ----
  const internal = (h: unknown) => {
    const got = Buffer.from(String(h ?? ''));
    const want = Buffer.from(config.internalSecret);
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw forbidden();
  };

  app.post(
    '/internal/rooms/log',
    { schema: { hide: true, body: Type.Object({ tenantId: Type.String(), sessionId: Type.String(), actor: Type.String(), action: Type.String(), target: Type.Optional(Type.String()), detail: Type.Optional(Type.Record(Type.String(), Type.Unknown())) }) } },
    async (req) => {
      internal(req.headers['x-internal-secret']);
      const b = req.body;
      await database.tenant(b.tenantId, (tx) => tx.insert(moderationLog).values({ id: newId('mod'), tenantId: b.tenantId, sessionId: b.sessionId, actor: b.actor, action: b.action, target: b.target ?? null, detail: b.detail ?? {} }));
      return { ok: true };
    },
  );

  app.post('/internal/rooms/ended', { schema: { hide: true, body: Type.Object({ tenantId: Type.String(), sessionId: Type.String() }) } }, async (req) => {
    internal(req.headers['x-internal-secret']);
    await database.tenant(req.body.tenantId, (tx) => tx.update(liveSessions).set({ status: 'ended', endedAt: new Date() }).where(and(eq(liveSessions.id, req.body.sessionId), eq(liveSessions.status, 'active'))));
    return { ok: true };
  });

  void classes;
};
