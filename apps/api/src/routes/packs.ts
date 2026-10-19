import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { bundleFetcher, loadPack, validatePack, type PackBundle, type PackData } from '@rihla/pack-schema';
import { packReviews, packVersions, packs, type Localized } from '../db/schema.js';
import { staff } from '../context.js';
import { newId } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/http.js';

const ASPECTS = ['content', 'language', 'culture'] as const;
const loc = (pack: PackData, key: string | undefined): Localized => {
  const out: Localized = {};
  if (!key) return out;
  for (const [l, table] of Object.entries(pack.locales)) if (table[key]) out[l] = table[key]!;
  return out;
};

/** What the API keeps about a version so reports and the portal never need to open bundles. */
export function summarize(pack: PackData) {
  const m = pack.manifest;
  const items: Record<string, { objectives: string[]; prompt: Localized; correct: Localized | null }> = {};
  for (const it of Object.values(pack.items)) {
    const right = it.options?.find((o) => o.correct);
    items[it.id] = { objectives: it.objectives, prompt: loc(pack, it.prompt), correct: right ? loc(pack, right.text) : it.answer !== undefined ? { 'ar-EG': String(it.answer), en: String(it.answer) } : null };
  }
  return {
    title: loc(pack, m.title),
    summary: loc(pack, m.summary),
    items,
    objectives: m.objectives.map((o) => ({ id: o.id, text: loc(pack, o.text) })),
    pois: Object.values(pack.pois).map((p) => ({ id: p.id, title: loc(pack, p.title), scene: p.scene })),
  };
}

/** index.json next to the bundles: the player reads `current` (rollback moves it) or `latest`. */
async function writeIndex(dir: string, id: string, update: (idx: { id: string; current?: string; latest?: string; versions: Record<string, { bundle: string; hash: string; builtAt: string }> }) => void) {
  const p = path.join(dir, id, 'index.json');
  const idx = JSON.parse(await readFile(p, 'utf8').catch(() => '{"versions":{}}'));
  idx.id = id;
  update(idx);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(idx, null, 2));
}

export const packRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config } = app.ctx;
  const db = database.db;

  /** Public catalog with filters (subject, grade, language, duration). */
  app.get(
    '/v1/packs',
    { schema: { tags: ['packs'], security: [], querystring: Type.Object({ subject: Type.Optional(Type.String()), grade: Type.Optional(Type.String()), q: Type.Optional(Type.String()), maxMinutes: Type.Optional(Type.Integer()) }) } },
    async (req) => {
      const rows = await db.select().from(packs).where(isNotNull(packs.currentVersion));
      const q = req.query;
      const list = rows.filter(
        (p) =>
          (!q.subject || p.subjects.includes(q.subject)) &&
          (!q.grade || p.grades.includes(q.grade)) &&
          (!q.maxMinutes || p.durationMinutes <= q.maxMinutes) &&
          (!q.q || Object.values(p.title).some((t) => t.toLowerCase().includes(q.q!.toLowerCase()))),
      );
      return { packs: list };
    },
  );

  app.get('/v1/packs/:id', { schema: { tags: ['packs'], security: [], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const [p] = await db.select().from(packs).where(eq(packs.id, req.params.id));
    if (!p?.currentVersion) throw notFound('Pack not found');
    const [v] = await db.select().from(packVersions).where(and(eq(packVersions.packId, p.id), eq(packVersions.version, p.currentVersion)));
    const m = (v?.manifest ?? {}) as { curriculum?: unknown; durationMinutes?: number; locales?: string[]; startPoi?: string; sensitivity?: string[] };
    return {
      pack: p,
      version: p.currentVersion,
      bundle: v?.bundlePath,
      objectives: v?.objectives ?? [],
      pois: v?.pois ?? [],
      curriculum: m.curriculum ?? [],
      locales: m.locales ?? [],
      startPoi: m.startPoi ?? null,
      itemCount: Object.keys(v?.items ?? {}).length,
      // prompts only (for the teacher's "push a question"); answers stay in the answer key
      items: Object.entries(v?.items ?? {}).map(([id, it]) => ({ id, prompt: it.prompt })),
    };
  });

  app.get('/v1/packs/:id/versions', { schema: { tags: ['packs'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    staff(req, 'author', 'reviewer');
    const versions = await db
      .select({ version: packVersions.version, hash: packVersions.hash, status: packVersions.status, publishedAt: packVersions.publishedAt, publishedBy: packVersions.publishedBy })
      .from(packVersions)
      .where(eq(packVersions.packId, req.params.id))
      .orderBy(desc(packVersions.publishedAt));
    const reviews = await db.select().from(packReviews).where(eq(packReviews.packId, req.params.id)).orderBy(desc(packReviews.at));
    return { versions, reviews };
  });

  /** Lesson plan and worksheet are public previews; the answer key is for staff. */
  app.get('/v1/packs/:id/teacher/:doc', { schema: { tags: ['packs'], security: [], params: Type.Object({ id: Type.String(), doc: Type.Union([Type.Literal('lesson-plan'), Type.Literal('worksheet'), Type.Literal('answer-key')]) }) } }, async (req, reply) => {
    if (req.params.doc === 'answer-key') staff(req);
    const [p] = await db.select().from(packs).where(eq(packs.id, req.params.id));
    if (!p?.currentVersion) throw notFound();
    const text = await readFile(path.join(config.storageDir, p.id, p.currentVersion, 'teacher', `${req.params.doc}.md`), 'utf8').catch(() => null);
    if (text === null) throw notFound('Not provided for this pack');
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return text;
  });

  /** A review step for one aspect (content, language, culture) with its comment trail (BRIEF §8). */
  app.post(
    '/v1/packs/:id/versions/:version/reviews',
    {
      schema: {
        tags: ['packs'],
        params: Type.Object({ id: Type.String(), version: Type.String() }),
        body: Type.Object({ aspect: Type.Union(ASPECTS.map((a) => Type.Literal(a))), state: Type.Union([Type.Literal('in-review'), Type.Literal('changes-requested'), Type.Literal('approved')]), comment: Type.String({ maxLength: 4000 }), country: Type.Optional(Type.String()) }),
      },
    },
    async (req) => {
      const a = staff(req, 'author', 'reviewer');
      if (req.body.state === 'approved' && !a.roles.some((r) => r === 'reviewer' || r === 'platform_admin')) throw forbidden('Only reviewers approve');
      const [r] = await db.insert(packReviews).values({ id: newId('rev'), packId: req.params.id, version: req.params.version, ...req.body, country: req.body.country ?? null, byUser: a.sub }).returning();
      await audit(db, { actorId: a.sub, action: 'pack.review', target: `${req.params.id}@${req.params.version}`, detail: req.body });
      return { review: r };
    },
  );

  /**
   * Publish an immutable version from a built bundle (`rihla-pack build`, or the Studio). The API runs the same
   * validator as the CLI and refuses anything with errors, or without the three review approvals.
   */
  app.post(
    '/v1/packs/:id/versions',
    {
      bodyLimit: 32 * 1024 * 1024,
      schema: {
        tags: ['packs'],
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          bundle: Type.Object({ format: Type.Literal('rihla-pack-bundle@1'), id: Type.String(), version: Type.String(), hash: Type.String(), builtAt: Type.String(), files: Type.Record(Type.String(), Type.Unknown()), assets: Type.Record(Type.String(), Type.String()) }),
          teacher: Type.Optional(Type.Object({ 'lesson-plan': Type.Optional(Type.String()), worksheet: Type.Optional(Type.String()), 'answer-key': Type.Optional(Type.String()) })),
          makeCurrent: Type.Optional(Type.Boolean()),
          overrideReviews: Type.Optional(Type.String({ description: 'Reason; platform admins only, audited' })),
        }),
      },
    },
    async (req) => {
      const a = staff(req, 'author');
      const bundle = req.body.bundle as PackBundle;
      if (bundle.id !== req.params.id) throw badRequest('id-mismatch');
      let pack: PackData;
      try {
        pack = await loadPack(bundleFetcher(bundle));
      } catch (e) {
        throw badRequest('bundle-unreadable', String((e as Error).message));
      }
      const report = validatePack(pack);
      if (!report.ok) throw Object.assign(new HttpError(422, 'pack-invalid', `${report.errors.length} validation error(s)`), { report });
      const v = pack.manifest.version;
      if (v !== bundle.version) throw badRequest('version-mismatch');
      const [existing] = await db.select().from(packVersions).where(and(eq(packVersions.packId, bundle.id), eq(packVersions.version, v)));
      if (existing) {
        if (existing.hash === bundle.hash) return { version: v, hash: existing.hash, unchanged: true };
        throw conflict('version-immutable', `${bundle.id}@${v} is already published with different content; bump the version`);
      }
      // review gate: latest state per aspect must be approved
      const reviews = await db.select().from(packReviews).where(and(eq(packReviews.packId, bundle.id), eq(packReviews.version, v))).orderBy(desc(packReviews.at));
      const missing = ASPECTS.filter((asp) => reviews.find((r) => r.aspect === asp)?.state !== 'approved');
      if (missing.length) {
        if (!req.body.overrideReviews || !a.roles.includes('platform_admin')) throw conflict('reviews-required', `Needs approval for: ${missing.join(', ')}`);
        await audit(db, { actorId: a.sub, action: 'pack.review-override', target: `${bundle.id}@${v}`, detail: { missing, reason: req.body.overrideReviews } });
      }
      const s = summarize(pack);
      const rel = `${bundle.id}/${v}/bundle.${bundle.hash}.json`;
      const vdir = path.join(config.storageDir, bundle.id, v);
      await mkdir(path.join(vdir, 'locales'), { recursive: true });
      await writeFile(path.join(config.storageDir, rel), JSON.stringify(bundle));
      await writeFile(path.join(vdir, 'manifest.json'), JSON.stringify(pack.manifest, null, 2));
      for (const [l, table] of Object.entries(pack.locales)) await writeFile(path.join(vdir, 'locales', `${l}.json`), JSON.stringify(table));
      if (req.body.teacher) {
        await mkdir(path.join(vdir, 'teacher'), { recursive: true });
        for (const [k, text] of Object.entries(req.body.teacher)) if (text) await writeFile(path.join(vdir, 'teacher', `${k}.md`), text);
      }
      const m = pack.manifest;
      await db
        .insert(packs)
        .values({ id: m.id, title: s.title, summary: s.summary, subjects: m.subjects, grades: m.grades, durationMinutes: m.durationMinutes })
        .onConflictDoUpdate({ target: packs.id, set: { title: s.title, summary: s.summary, subjects: m.subjects, grades: m.grades, durationMinutes: m.durationMinutes } });
      await db.insert(packVersions).values({ packId: m.id, version: v, hash: bundle.hash, bundlePath: rel, manifest: m as unknown as Record<string, unknown>, items: s.items, objectives: s.objectives, pois: s.pois, publishedBy: a.sub });
      const makeCurrent = req.body.makeCurrent ?? true;
      if (makeCurrent) await db.update(packs).set({ currentVersion: v }).where(eq(packs.id, m.id));
      await writeIndex(config.storageDir, m.id, (idx) => {
        idx.versions[v] = { bundle: `${v}/bundle.${bundle.hash}.json`, hash: bundle.hash, builtAt: bundle.builtAt };
        idx.latest = v;
        if (makeCurrent) idx.current = v;
      });
      await audit(db, { actorId: a.sub, action: 'pack.published', target: `${m.id}@${v}`, detail: { hash: bundle.hash, warnings: report.warnings.length } });
      return { version: v, hash: bundle.hash, bundle: rel, warnings: report.warnings.length };
    },
  );

  /** Roll back (or forward) to another published version; retire a version. */
  app.post('/v1/packs/:id/current', { schema: { tags: ['packs'], params: Type.Object({ id: Type.String() }), body: Type.Object({ version: Type.String(), retire: Type.Optional(Type.String()) }) } }, async (req) => {
    const a = staff(req, 'platform_admin');
    if (!a.roles.includes('platform_admin')) throw forbidden();
    const [v] = await db.select().from(packVersions).where(and(eq(packVersions.packId, req.params.id), eq(packVersions.version, req.body.version), eq(packVersions.status, 'published')));
    if (!v) throw notFound('Version not found');
    await db.update(packs).set({ currentVersion: v.version }).where(eq(packs.id, req.params.id));
    if (req.body.retire) await db.update(packVersions).set({ status: 'retired' }).where(and(eq(packVersions.packId, req.params.id), eq(packVersions.version, req.body.retire)));
    await writeIndex(config.storageDir, req.params.id, (idx) => {
      idx.current = v.version;
    });
    await audit(db, { actorId: a.sub, action: 'pack.current', target: req.params.id, detail: req.body });
    return { current: v.version };
  });
};
