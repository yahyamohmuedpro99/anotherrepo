import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { classes, students } from '../db/schema.js';
import { isAdmin, staff } from '../context.js';
import type { StaffClaims } from '../auth/tokens.js';
import { joinCode, newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { nameProblem, normalizeName } from '../lib/names.js';

/** A class the caller may manage: its teacher, or a school admin of the same tenant. */
export async function ownClass(tx: Tx, a: StaffClaims, id: string) {
  const [c] = await tx.select().from(classes).where(eq(classes.id, id));
  if (!c) throw notFound('Class not found');
  if (c.teacherId !== a.sub && !isAdmin(a)) throw forbidden('Not your class');
  return c;
}

export async function uniqueJoinCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = joinCode();
    const [hit] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code));
    if (!hit) return code;
  }
  throw new Error('could not allocate a join code');
}

const ClassBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  grade: Type.Optional(Type.String({ maxLength: 20 })),
  namePolicy: Type.Optional(Type.Union([Type.Literal('list'), Type.Literal('typed')])),
});

export const classRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database } = app.ctx;

  app.get('/v1/classes', { schema: { tags: ['classes'], querystring: Type.Object({ archived: Type.Optional(Type.Boolean()) }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const rows = await tx
        .select({ c: classes, students: count(students.id) })
        .from(classes)
        .leftJoin(students, eq(students.classId, classes.id))
        .where(and(isAdmin(a) ? undefined : eq(classes.teacherId, a.sub), req.query.archived ? undefined : isNull(classes.archivedAt)))
        .groupBy(classes.id)
        .orderBy(asc(classes.createdAt));
      return { classes: rows.map((r) => ({ ...r.c, students: Number(r.students) })) };
    });
  });

  app.post('/v1/classes', { schema: { tags: ['classes'], body: ClassBody } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      const [c] = await tx
        .insert(classes)
        .values({ id: newId('cls'), tenantId: a.tid, name: req.body.name, grade: req.body.grade ?? null, teacherId: a.sub, joinCode: await uniqueJoinCode(tx), namePolicy: req.body.namePolicy ?? 'list' })
        .returning();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'class.created', target: c!.id });
      return { class: c };
    });
  });

  app.patch(
    '/v1/classes/:id',
    { schema: { tags: ['classes'], params: Type.Object({ id: Type.String() }), body: Type.Partial(Type.Composite([ClassBody, Type.Object({ archived: Type.Boolean(), chatAllowed: Type.Boolean() })])) } },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      return database.tenant(a.tid, async (tx) => {
        await ownClass(tx, a, req.params.id);
        const { archived, ...rest } = req.body;
        const [c] = await tx
          .update(classes)
          .set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
          .where(eq(classes.id, req.params.id))
          .returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'class.updated', target: req.params.id, detail: req.body });
        return { class: c };
      });
    },
  );

  app.post('/v1/classes/:id/code', { schema: { tags: ['classes'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      await ownClass(tx, a, req.params.id);
      const [c] = await tx.update(classes).set({ joinCode: await uniqueJoinCode(tx) }).where(eq(classes.id, req.params.id)).returning();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'class.code-regenerated', target: req.params.id });
      return { joinCode: c!.joinCode };
    });
  });

  app.get('/v1/classes/:id/students', { schema: { tags: ['classes'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = staff(req, 'teacher', 'school_admin');
    return database.tenant(a.tid, async (tx) => {
      await ownClass(tx, a, req.params.id);
      const rows = await tx.select().from(students).where(eq(students.classId, req.params.id)).orderBy(asc(students.displayName));
      return { students: rows };
    });
  });

  /** Roster import: one display name per line (or a CSV whose first column is the name). */
  app.post(
    '/v1/classes/:id/students',
    { schema: { tags: ['classes'], params: Type.Object({ id: Type.String() }), body: Type.Object({ names: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 200 })), csv: Type.Optional(Type.String({ maxLength: 20000 })) }) } },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      const names = [...(req.body.names ?? []), ...(req.body.csv ?? '').split(/\r?\n/).slice(1).map((l) => l.split(',')[0]!.replace(/^"|"$/g, ''))]
        .map(normalizeName)
        .filter(Boolean);
      return database.tenant(a.tid, async (tx) => {
        await ownClass(tx, a, req.params.id);
        const added: string[] = [], rejected: { name: string; reason: string }[] = [];
        for (const n of names) {
          const p = nameProblem(n);
          if (p) {
            rejected.push({ name: n, reason: p });
            continue;
          }
          await tx.insert(students).values({ id: newId('stu'), tenantId: a.tid, classId: req.params.id, displayName: n, nameStatus: 'approved' });
          added.push(n);
        }
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'class.roster-import', target: req.params.id, detail: { added: added.length, rejected: rejected.length } });
        return { added, rejected };
      });
    },
  );

  /** Teacher approves, rejects or renames a typed display name. */
  app.patch(
    '/v1/students/:id',
    { schema: { tags: ['classes'], params: Type.Object({ id: Type.String() }), body: Type.Object({ displayName: Type.Optional(Type.String({ maxLength: 40 })), nameStatus: Type.Optional(Type.Union([Type.Literal('approved'), Type.Literal('rejected')])) }) } },
    async (req) => {
      const a = staff(req, 'teacher', 'school_admin');
      return database.tenant(a.tid, async (tx) => {
        const [s] = await tx.select().from(students).where(eq(students.id, req.params.id));
        if (!s) throw notFound('Student not found');
        await ownClass(tx, a, s.classId);
        const set: Partial<typeof students.$inferInsert> = {};
        if (req.body.displayName !== undefined) {
          const n = normalizeName(req.body.displayName);
          const p = nameProblem(n);
          if (p) throw badRequest('name-' + p);
          set.displayName = n;
          set.nameStatus = 'approved';
        }
        if (req.body.nameStatus) set.nameStatus = req.body.nameStatus;
        const [row] = await tx.update(students).set(set).where(eq(students.id, s.id)).returning();
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'student.updated', target: s.id, detail: { nameStatus: row!.nameStatus } });
        return { student: row };
      });
    },
  );
};
