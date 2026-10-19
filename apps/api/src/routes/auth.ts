import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { invites, memberships, refreshTokens, tenants, users, type Role } from '../db/schema.js';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/passwords.js';
import { opaqueToken, sha256, signAccess } from '../auth/tokens.js';
import { badRequest, forbidden, tooMany, unauthorized } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { staff } from '../context.js';

// The refresh cookie is httpOnly and SameSite=Lax; path '/' so it also works behind the portal's /api proxy.
const COOKIE = 'rihla_rt';
const REFRESH_DAYS = 30;

const Session = Type.Object({
  accessToken: Type.String(),
  user: Type.Object({ id: Type.String(), name: Type.String(), email: Type.String(), locale: Type.String() }),
  tenant: Type.Object({ id: Type.String(), name: Type.String(), kind: Type.String() }),
  roles: Type.Array(Type.String()),
  tenants: Type.Array(Type.Object({ id: Type.String(), name: Type.String(), kind: Type.String(), roles: Type.Array(Type.String()) })),
});

async function tenantsOf(app: FastifyInstance, userId: string) {
  const rows = await app.ctx.database.db
    .select({ id: tenants.id, name: tenants.name, kind: tenants.kind, role: memberships.role })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.userId, userId));
  const by = new Map<string, { id: string; name: string; kind: string; roles: Role[] }>();
  for (const r of rows) {
    const t = by.get(r.id) ?? { id: r.id, name: r.name, kind: r.kind, roles: [] };
    t.roles.push(r.role);
    by.set(r.id, t);
  }
  return [...by.values()];
}

/** Access token for one tenant + a rotated refresh cookie. */
export async function issueSession(app: FastifyInstance, reply: FastifyReply, userId: string, tenantId?: string) {
  const db = app.ctx.database.db;
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.disabledAt) throw unauthorized();
  const list = await tenantsOf(app, userId);
  const t = (tenantId && list.find((x) => x.id === tenantId)) || list[0];
  if (!t) throw forbidden('This account has no school or publisher yet');
  const accessToken = await signAccess({ kind: 'staff', sub: u.id, tid: t.id, roles: t.roles }, app.ctx.config.jwtSecret);
  const rt = opaqueToken();
  await db.insert(refreshTokens).values({ tokenHash: rt.hash, userId: u.id, expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) });
  reply.setCookie(COOKIE, rt.token, { httpOnly: true, sameSite: 'lax', secure: app.ctx.config.cookieSecure, path: '/', maxAge: REFRESH_DAYS * 86400 });
  return { accessToken, user: { id: u.id, name: u.name, email: u.email, locale: u.locale }, tenant: { id: t.id, name: t.name, kind: t.kind }, roles: t.roles, tenants: list };
}

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.ctx.database.db;

  app.get('/v1/auth/providers', { schema: { tags: ['auth'], security: [] } }, async () => ({
    password: true,
    google: !!app.ctx.config.oidc.google,
    microsoft: !!app.ctx.config.oidc.microsoft,
  }));

  app.post(
    '/v1/auth/login',
    { schema: { tags: ['auth'], security: [], body: Type.Object({ email: Type.String({ maxLength: 200 }), password: Type.String({ maxLength: 200 }), tenantId: Type.Optional(Type.String()) }), response: { 200: Session } } },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      if (!app.ctx.limits.login.take(`${req.ip}:${email}`)) throw tooMany();
      const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      // same work and same answer whether or not the account exists
      const ok = await verifyPassword(req.body.password, u?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      if (!u || !ok || u.disabledAt) throw unauthorized('Email or password is wrong');
      await audit(db, { actorId: u.id, action: 'auth.login', target: u.id });
      return issueSession(app, reply, u.id, req.body.tenantId);
    },
  );

  app.post('/v1/auth/refresh', { schema: { tags: ['auth'], security: [], querystring: Type.Object({ tenantId: Type.Optional(Type.String()) }), response: { 200: Session } } }, async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const [row] = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
      .returning();
    if (!row) throw unauthorized('Session expired, sign in again');
    return issueSession(app, reply, row.userId, req.query.tenantId);
  });

  app.post('/v1/auth/logout', { schema: { tags: ['auth'], security: [] } }, async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(token)));
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post(
    '/v1/auth/accept-invite',
    { schema: { tags: ['auth'], security: [], body: Type.Object({ token: Type.String(), password: Type.String({ maxLength: 200 }), name: Type.Optional(Type.String({ maxLength: 80 })) }), response: { 200: Session } } },
    async (req, reply) => {
      const [inv] = await db.select().from(invites).where(and(eq(invites.tokenHash, sha256(req.body.token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
      if (!inv) throw badRequest('invite-invalid', 'This invite link has expired or was already used');
      const problem = passwordProblem(req.body.password);
      if (problem) throw badRequest('weak-password', problem);
      const hash = await hashPassword(req.body.password);
      let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`);
      if (!u) [u] = await db.insert(users).values({ id: newId('usr'), email: inv.email, name: req.body.name ?? inv.name, passwordHash: hash }).returning();
      else if (!u.passwordHash) await db.update(users).set({ passwordHash: hash }).where(eq(users.id, u.id));
      await db.insert(memberships).values({ userId: u!.id, tenantId: inv.tenantId, role: inv.role }).onConflictDoNothing();
      await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.tokenHash, inv.tokenHash));
      await audit(db, { tenantId: inv.tenantId, actorId: u!.id, action: 'invite.accepted', target: u!.id, detail: { role: inv.role } });
      return issueSession(app, reply, u!.id, inv.tenantId);
    },
  );

  app.get('/v1/me', { schema: { tags: ['auth'] } }, async (req) => {
    const a = staff(req);
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email, locale: users.locale }).from(users).where(eq(users.id, a.sub));
    return { user: u, tenantId: a.tid, roles: a.roles, tenants: await tenantsOf(app, a.sub) };
  });
};
