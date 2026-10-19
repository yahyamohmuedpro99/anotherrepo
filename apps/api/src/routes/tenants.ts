import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, count, eq, isNull } from 'drizzle-orm';
import { classes, invites, memberships, students, tenants, users, ROLES, type Role } from '../db/schema.js';
import { opaqueToken } from '../auth/tokens.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { staff } from '../context.js';

const RoleT = Type.Union(ROLES.map((r) => Type.Literal(r)));

/** Which roles each admin may hand out. */
function canInvite(mine: Role[], role: Role): boolean {
  if (mine.includes('platform_admin')) return true;
  if (mine.includes('school_admin')) return role === 'teacher' || role === 'school_admin';
  if (mine.includes('publisher_admin')) return role === 'publisher_admin';
  return false;
}

export const tenantRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config } = app.ctx;
  const db = database.db;

  async function makeInvite(tenantId: string, email: string, name: string, role: Role, by: string) {
    const t = opaqueToken();
    await db.insert(invites).values({ tokenHash: t.hash, tenantId, email: email.trim().toLowerCase(), name, role, invitedBy: by, expiresAt: new Date(Date.now() + 14 * 864e5) });
    // Email delivery needs a provider decision (docs/OPEN-QUESTIONS.md); the admin shares the link meanwhile.
    return { inviteUrl: `${config.portalUrl}/invite/${t.token}`, token: t.token };
  }

  app.post(
    '/v1/tenants',
    {
      schema: {
        tags: ['tenants'],
        body: Type.Object({
          kind: Type.Union([Type.Literal('school'), Type.Literal('publisher'), Type.Literal('platform')]),
          name: Type.String({ minLength: 2, maxLength: 120 }),
          region: Type.Optional(Type.String({ pattern: '^[a-z]{2}$' })),
          seats: Type.Optional(Type.Integer({ minimum: 0 })),
          retentionDays: Type.Optional(Type.Integer({ minimum: 30, maximum: 3650 })),
          consentRequired: Type.Optional(Type.Boolean()),
          contractStart: Type.Optional(Type.String({ format: 'date' })),
          contractEnd: Type.Optional(Type.String({ format: 'date' })),
          admin: Type.Optional(Type.Object({ email: Type.String({ format: 'email' }), name: Type.String() })),
        }),
      },
    },
    async (req) => {
      const a = staff(req, 'platform_admin');
      if (!a.roles.includes('platform_admin')) throw forbidden();
      const b = req.body;
      const [t] = await db
        .insert(tenants)
        .values({ id: newId('ten'), kind: b.kind, name: b.name, region: b.region ?? 'eg', seats: b.seats ?? 0, retentionDays: b.retentionDays ?? 365, consentRequired: b.consentRequired ?? true, contractStart: b.contractStart ?? null, contractEnd: b.contractEnd ?? null })
        .returning();
      await audit(db, { tenantId: t!.id, actorId: a.sub, action: 'tenant.created', target: t!.id, detail: { kind: b.kind } });
      const invite = b.admin ? await makeInvite(t!.id, b.admin.email, b.admin.name, b.kind === 'publisher' ? 'publisher_admin' : 'school_admin', a.sub) : null;
      return { tenant: t, invite };
    },
  );

  app.get('/v1/tenants', { schema: { tags: ['tenants'] } }, async (req) => {
    const a = staff(req, 'platform_admin');
    if (!a.roles.includes('platform_admin')) throw forbidden();
    return { tenants: await db.select().from(tenants).orderBy(tenants.createdAt) };
  });

  app.get('/v1/tenant', { schema: { tags: ['tenants'] } }, async (req) => {
    const a = staff(req);
    const [t] = await db.select().from(tenants).where(eq(tenants.id, a.tid));
    if (!t) throw notFound();
    const [{ n }] = (await database.tenant(a.tid, (tx) => tx.select({ n: count() }).from(students).innerJoin(classes, eq(classes.id, students.classId)).where(isNull(classes.archivedAt)))) as [{ n: number }];
    return { tenant: t, seatsUsed: Number(n) };
  });

  app.patch(
    '/v1/tenant',
    { schema: { tags: ['tenants'], body: Type.Object({ name: Type.Optional(Type.String({ minLength: 2 })), retentionDays: Type.Optional(Type.Integer({ minimum: 30, maximum: 3650 })), consentRequired: Type.Optional(Type.Boolean()), seats: Type.Optional(Type.Integer({ minimum: 0 })) }) } },
    async (req) => {
      const a = staff(req, 'school_admin', 'publisher_admin');
      if (req.body.seats !== undefined && !a.roles.includes('platform_admin')) throw forbidden('Seats change through the contract');
      const [t] = await db.update(tenants).set(req.body).where(eq(tenants.id, a.tid)).returning();
      await audit(db, { tenantId: a.tid, actorId: a.sub, action: 'tenant.updated', target: a.tid, detail: req.body });
      return { tenant: t };
    },
  );

  app.get('/v1/members', { schema: { tags: ['tenants'] } }, async (req) => {
    const a = staff(req, 'school_admin', 'publisher_admin');
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, disabledAt: users.disabledAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, a.tid));
    const pending = await db.select({ email: invites.email, name: invites.name, role: invites.role, expiresAt: invites.expiresAt }).from(invites).where(and(eq(invites.tenantId, a.tid), isNull(invites.acceptedAt)));
    return { members: rows, pending };
  });

  app.post('/v1/invites', { schema: { tags: ['tenants'], body: Type.Object({ email: Type.String({ format: 'email' }), name: Type.String({ minLength: 1, maxLength: 80 }), role: RoleT }) } }, async (req) => {
    const a = staff(req, 'school_admin', 'publisher_admin');
    if (!canInvite(a.roles, req.body.role)) throw forbidden(`You cannot invite a ${req.body.role}`);
    const inv = await makeInvite(a.tid, req.body.email, req.body.name, req.body.role, a.sub);
    await audit(db, { tenantId: a.tid, actorId: a.sub, action: 'invite.created', target: req.body.email, detail: { role: req.body.role } });
    return inv;
  });

  /** Deactivate: remove the person's roles in this tenant (their classes stay with the school). */
  app.delete('/v1/members/:userId', { schema: { tags: ['tenants'], params: Type.Object({ userId: Type.String() }) } }, async (req) => {
    const a = staff(req, 'school_admin', 'publisher_admin');
    if (req.params.userId === a.sub) throw badRequest('self', 'You cannot remove yourself');
    await db.delete(memberships).where(and(eq(memberships.tenantId, a.tid), eq(memberships.userId, req.params.userId)));
    await audit(db, { tenantId: a.tid, actorId: a.sub, action: 'member.removed', target: req.params.userId });
    return { ok: true };
  });
};
