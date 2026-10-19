import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { assignments, classes, codeDailyCounts, liveSessions, packs, packVersions, qrCodes, students } from '../db/schema.js';
import type { Tx } from '../db/client.js';
import { signAccess, signRoom, sha256 } from '../auth/tokens.js';
import { isJoinCode, newId } from '../lib/ids.js';
import { badRequest, HttpError, notFound, tooMany } from '../lib/http.js';
import { isSuggestedName, nameProblem, normalizeName, suggestNames } from '../lib/names.js';

const COLORS = ['#2f63b0', '#c4533c', '#239a8c', '#6e4a9e', '#d39b2f', '#3c8a48', '#b0477a', '#4a8fb0'];
export const colorFor = (id: string) => COLORS[parseInt(sha256(id).slice(0, 6), 16) % COLORS.length]!;
const today = () => new Date().toISOString().slice(0, 10);

/** The assignment students land in: the newest one that is not past due. */
export async function currentAssignment(tx: Tx, classId: string) {
  const rows = await tx.select().from(assignments).where(eq(assignments.classId, classId)).orderBy(desc(assignments.createdAt)).limit(10);
  return rows.find((a) => !a.dueAt || a.dueAt.getTime() > Date.now()) ?? rows[0] ?? null;
}

/** If a pack version linked from a page was retired, send the scan to the pack's current version and log it. */
async function liveVersionPoi(tx: Tx, packId: string, poiId: string | null) {
  const [p] = await tx.select().from(packs).where(eq(packs.id, packId));
  if (!p?.currentVersion) return { packId, poiId };
  const [v] = await tx.select().from(packVersions).where(and(eq(packVersions.packId, packId), eq(packVersions.version, p.currentVersion)));
  if (poiId && v && !v.pois.some((x) => x.id === poiId)) return { packId, poiId: (v.manifest as { startPoi?: string }).startPoi ?? null, redirected: true };
  return { packId, poiId };
}

export const joinRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config, limits } = app.ctx;

  async function resolve(code: string, device: string, ip: string) {
    if (!limits.scan.take(`ip:${ip}`) || (device && !limits.scanDevice.take(`dev:${device}`))) throw tooMany();
    if (isJoinCode(code.toUpperCase())) {
      return database.system(async (tx) => {
        const [c] = await tx.select().from(classes).where(and(eq(classes.joinCode, code.toUpperCase()), isNull(classes.archivedAt)));
        if (!c) throw notFound('Unknown code');
        const asg = await currentAssignment(tx, c.id);
        const taken = new Set((await tx.select({ n: students.displayName }).from(students).where(eq(students.classId, c.id))).map((r) => r.n));
        return { type: 'class' as const, packId: asg?.packId ?? null, poiId: asg?.poiId ?? null, namePolicy: c.namePolicy, suggestions: suggestNames(8, 'ar-EG', taken) };
      });
    }
    return database.system(async (tx) => {
      const [q] = await tx.select().from(qrCodes).where(eq(qrCodes.code, code.toLowerCase()));
      if (!q) throw notFound('Unknown code');
      if (q.disabledAt) throw new HttpError(410, 'code-disabled', 'This code was retired');
      await tx
        .insert(codeDailyCounts)
        .values({ code: q.code, day: today(), scans: 1 })
        .onConflictDoUpdate({ target: [codeDailyCounts.code, codeDailyCounts.day], set: { scans: sql`${codeDailyCounts.scans} + 1` } });
      let access: 'full' | 'sample' = q.type === 'public' ? 'sample' : 'full';
      if (q.type === 'copy') {
        // per-copy codes: the first device to scan owns it for the school year
        const dev = device ? sha256(device) : '';
        if (!q.activatedDevice && dev) await tx.update(qrCodes).set({ activatedDevice: dev, activatedAt: new Date() }).where(eq(qrCodes.code, q.code));
        else if (q.activatedDevice !== dev) access = 'sample';
      }
      const dest = await liveVersionPoi(tx, q.packId, q.poiId);
      if ('redirected' in dest) app.log.warn({ code: q.code, packId: q.packId }, 'qr destination POI retired; redirected to start POI');
      return { type: q.type === 'copy' ? ('copy' as const) : q.type === 'book' ? ('book' as const) : ('public' as const), packId: dest.packId, poiId: dest.poiId, access };
    });
  }

  app.get('/v1/codes/:code/resolve', { schema: { tags: ['join'], security: [], params: Type.Object({ code: Type.String({ maxLength: 16 }) }) } }, async (req) =>
    resolve(req.params.code, String(req.headers['x-device-id'] ?? ''), req.ip),
  );

  /** The short link that is printed under every QR code. */
  app.get('/s/:code', { schema: { tags: ['join'], security: [], params: Type.Object({ code: Type.String({ maxLength: 16 }) }) } }, async (req, reply) => {
    try {
      const r = await resolve(req.params.code, '', req.ip);
      const target = r.packId ? `${config.playerUrl}/x/${encodeURIComponent(r.packId)}/${encodeURIComponent(r.poiId ?? '')}?c=${encodeURIComponent(req.params.code)}` : `${config.playerUrl}/`;
      return reply.redirect(target, 302);
    } catch (e) {
      if (e instanceof HttpError && e.statusCode === 429) throw e;
      // a printed code must never dead-end: fall back to the catalog
      return reply.redirect(`${config.playerUrl}/`, 302);
    }
  });

  app.post(
    '/v1/join',
    { schema: { tags: ['join'], security: [], body: Type.Object({ code: Type.String({ maxLength: 8 }), displayName: Type.String({ maxLength: 40 }), deviceId: Type.Optional(Type.String({ maxLength: 64 })) }) } },
    async (req) => {
      if (!limits.join.take(req.ip)) throw tooMany();
      const code = req.body.code.toUpperCase();
      if (!isJoinCode(code)) throw badRequest('code-invalid');
      const name = normalizeName(req.body.displayName);
      const problem = nameProblem(name);
      if (problem) throw badRequest('name-' + problem);
      return database.system(async (tx) => {
        const [c] = await tx.select().from(classes).where(and(eq(classes.joinCode, code), isNull(classes.archivedAt)));
        if (!c) throw notFound('Unknown class code');
        let [s] = await tx.select().from(students).where(and(eq(students.classId, c.id), eq(students.displayName, name)));
        if (s?.nameStatus === 'rejected') throw badRequest('name-rejected', 'Pick another name');
        if (!s) {
          if (c.namePolicy === 'list' && !isSuggestedName(name)) throw badRequest('name-not-in-list', 'Pick a name from the list');
          [s] = await tx
            .insert(students)
            .values({ id: newId('stu'), tenantId: c.tenantId, classId: c.id, displayName: name, nameStatus: isSuggestedName(name) ? 'approved' : 'pending' })
            .returning();
        }
        await tx.update(students).set({ lastSeenAt: new Date() }).where(eq(students.id, s!.id));
        const asg = await currentAssignment(tx, c.id);
        const [live] = await tx.select().from(liveSessions).where(and(eq(liveSessions.classId, c.id), eq(liveSessions.status, 'active'))).orderBy(desc(liveSessions.startedAt)).limit(1);
        const token = await signAccess({ kind: 'student', sub: s!.id, tid: c.tenantId, cid: c.id }, config.jwtSecret);
        const shown = s!.nameStatus === 'approved' ? s!.displayName : '…';
        const roomToken = live ? await signRoom({ kind: 'room', sub: s!.id, sid: live.id, tid: c.tenantId, cid: c.id, role: 'student', name: shown, color: colorFor(s!.id), chat: live.chatEnabled }, config.roomSecret) : undefined;
        return {
          token,
          studentId: s!.id,
          classId: c.id,
          displayName: s!.displayName,
          nameStatus: s!.nameStatus,
          ...(roomToken ? { roomToken, sessionId: live!.id } : {}),
          ...(asg ? { packId: asg.packId, poiId: asg.poiId, assignment: { id: asg.id, hints: asg.hints, preQuiz: asg.preQuiz, postQuiz: asg.postQuiz } } : {}),
        };
      });
    },
  );
};
