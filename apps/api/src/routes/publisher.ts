import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { bookPages, books, codeDailyCounts, packVersions, packs, pageLinks, qrBatches, qrCodes, type CodeType } from '../db/schema.js';
import type { Tx } from '../db/client.js';
import { staff } from '../context.js';
import { newId, slug } from '../lib/ids.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http.js';
import { qrPng, qrSvg, sheetSvg } from '../lib/qr.js';

async function checkDestination(tx: Tx, packId: string, poiId: string | null) {
  const [p] = await tx.select().from(packs).where(eq(packs.id, packId));
  if (!p?.currentVersion) throw badRequest('pack-unknown');
  if (!poiId) return;
  const [v] = await tx.select().from(packVersions).where(and(eq(packVersions.packId, packId), eq(packVersions.version, p.currentVersion)));
  if (!v?.pois.some((x) => x.id === poiId)) throw badRequest('poi-unknown');
}

/** Publisher area (BRIEF §6, §7): books → pages → links, QR batches, aggregate analytics (never per child). */
export const publisherRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const { database, config } = app.ctx;
  const shortLink = (code: string) => `${config.shortUrl}/${code}`;
  const pub = (req: Parameters<typeof staff>[0]) => staff(req, 'publisher_admin');

  app.get('/v1/books', { schema: { tags: ['publisher'] } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => ({ books: await tx.select().from(books).orderBy(asc(books.title)) }));
  });

  app.post('/v1/books', { schema: { tags: ['publisher'], body: Type.Object({ title: Type.String({ minLength: 1, maxLength: 200 }), isbn: Type.Optional(Type.String()), country: Type.Optional(Type.String({ pattern: '^[A-Z]{2}$' })), grade: Type.Optional(Type.String()), subject: Type.Optional(Type.String()) }) } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => {
      const [b] = await tx.insert(books).values({ id: newId('bok'), tenantId: a.tid, ...req.body, isbn: req.body.isbn ?? null, grade: req.body.grade ?? null, subject: req.body.subject ?? null }).returning();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'book.created', target: b!.id });
      return { book: b };
    });
  });

  app.get('/v1/books/:id', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }) } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => {
      const [b] = await tx.select().from(books).where(eq(books.id, req.params.id));
      if (!b) throw notFound('Book not found');
      const pages = await tx.select().from(bookPages).where(eq(bookPages.bookId, b.id)).orderBy(asc(bookPages.chapter), asc(bookPages.page));
      const links = pages.length ? await tx.select().from(pageLinks).where(inArray(pageLinks.pageId, pages.map((p) => p.id))) : [];
      return { book: b, pages: pages.map((p) => ({ ...p, links: links.filter((l) => l.pageId === p.id) })) };
    });
  });

  app.post('/v1/books/:id/pages', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }), body: Type.Object({ chapter: Type.String({ maxLength: 80 }), page: Type.String({ maxLength: 20 }), label: Type.Optional(Type.String({ maxLength: 200 })) }) } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => {
      const [b] = await tx.select().from(books).where(eq(books.id, req.params.id));
      if (!b) throw notFound('Book not found');
      const [p] = await tx.insert(bookPages).values({ id: newId('pag'), tenantId: a.tid, bookId: b.id, chapter: req.body.chapter, page: req.body.page, label: req.body.label ?? '' }).returning();
      return { page: p };
    });
  });

  app.post('/v1/pages/:id/links', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }), body: Type.Object({ packId: Type.String(), poiId: Type.String() }) } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => {
      const [p] = await tx.select().from(bookPages).where(eq(bookPages.id, req.params.id));
      if (!p) throw notFound('Page not found');
      await checkDestination(tx, req.body.packId, req.body.poiId);
      const [l] = await tx.insert(pageLinks).values({ id: newId('lnk'), tenantId: a.tid, pageId: p.id, ...req.body }).returning();
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'page.linked', target: l!.id, detail: req.body });
      return { link: l };
    });
  });

  /** Changing a link re-points every code printed for it: nothing has to be reprinted (BRIEF §7). */
  app.patch('/v1/links/:id', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }), body: Type.Object({ packId: Type.String(), poiId: Type.String() }) } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => {
      await checkDestination(tx, req.body.packId, req.body.poiId);
      const [l] = await tx.update(pageLinks).set(req.body).where(eq(pageLinks.id, req.params.id)).returning();
      if (!l) throw notFound('Link not found');
      const moved = await tx.update(qrCodes).set({ packId: req.body.packId, poiId: req.body.poiId }).where(eq(qrCodes.pageLinkId, l.id)).returning({ code: qrCodes.code });
      await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'page.relinked', target: l.id, detail: { ...req.body, codes: moved.length } });
      return { link: l, codesUpdated: moved.length };
    });
  });

  app.get('/v1/qr-batches', { schema: { tags: ['publisher'] } }, async (req) => {
    const a = pub(req);
    return database.tenant(a.tid, async (tx) => ({ batches: await tx.select().from(qrBatches).orderBy(desc(qrBatches.createdAt)) }));
  });

  app.post(
    '/v1/qr-batches',
    {
      schema: {
        tags: ['publisher'],
        body: Type.Object({
          type: Type.Union([Type.Literal('public'), Type.Literal('book'), Type.Literal('copy')]),
          pageLinkId: Type.Optional(Type.String()),
          packId: Type.Optional(Type.String()),
          poiId: Type.Optional(Type.String()),
          count: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
        }),
      },
    },
    async (req) => {
      const a = pub(req);
      const b = req.body;
      return database.tenant(a.tid, async (tx) => {
        let packId = b.packId, poiId = b.poiId ?? null;
        if (b.pageLinkId) {
          const [l] = await tx.select().from(pageLinks).where(eq(pageLinks.id, b.pageLinkId));
          if (!l) throw notFound('Link not found');
          packId = l.packId;
          poiId = l.poiId;
        }
        if (!packId) throw badRequest('destination-required', 'Give a page link or a pack');
        await checkDestination(tx, packId, poiId);
        // public and book codes are one code shared by every copy; per-copy codes are one per printed copy
        const count = b.type === 'copy' ? (b.count ?? 1) : 1;
        const [batch] = await tx.insert(qrBatches).values({ id: newId('qrb'), tenantId: a.tid, pageLinkId: b.pageLinkId ?? null, type: b.type as CodeType, count, createdBy: a.sub }).returning();
        const codes: string[] = [];
        while (codes.length < count) {
          const chunk = Array.from({ length: Math.min(500, count - codes.length) }, () => slug());
          const ins = await tx
            .insert(qrCodes)
            .values(chunk.map((code) => ({ code, tenantId: a.tid, batchId: batch!.id, type: b.type as CodeType, packId: packId!, poiId, pageLinkId: b.pageLinkId ?? null })))
            .onConflictDoNothing()
            .returning({ code: qrCodes.code });
          codes.push(...ins.map((r) => r.code));
        }
        await audit(tx, { tenantId: a.tid, actorId: a.sub, action: 'qr.batch-created', target: batch!.id, detail: { type: b.type, count } });
        return { batch, codes: codes.slice(0, 50), shortLinks: codes.slice(0, 50).map(shortLink) };
      });
    },
  );

  async function batchCodes(tid: string, id: string) {
    return database.tenant(tid, async (tx) => {
      const [batch] = await tx.select().from(qrBatches).where(eq(qrBatches.id, id));
      if (!batch) throw notFound('Batch not found');
      const codes = await tx.select().from(qrCodes).where(eq(qrCodes.batchId, id)).orderBy(asc(qrCodes.createdAt));
      let caption = '';
      if (batch.pageLinkId) {
        const [row] = await tx.select({ page: bookPages.page, chapter: bookPages.chapter, title: books.title }).from(pageLinks).innerJoin(bookPages, eq(bookPages.id, pageLinks.pageId)).innerJoin(books, eq(books.id, bookPages.bookId)).where(eq(pageLinks.id, batch.pageLinkId));
        if (row) caption = `${row.title} · ${row.chapter} · ص ${row.page}`;
      }
      return { batch, codes, caption };
    });
  }

  app.get('/v1/qr-batches/:id/codes.csv', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }) } }, async (req, reply) => {
    const a = pub(req);
    const { codes } = await batchCodes(a.tid, req.params.id);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${req.params.id}.csv"`);
    return 'code,short_url,pack,poi,type\r\n' + codes.map((c) => [c.code, shortLink(c.code), c.packId, c.poiId ?? '', c.type].join(',')).join('\r\n') + '\r\n';
  });

  /** Print-ready A4 sheet(s): every code with its short URL printed underneath. */
  app.get('/v1/qr-batches/:id/sheet.svg', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }) } }, async (req, reply) => {
    const a = pub(req);
    const { codes, caption } = await batchCodes(a.tid, req.params.id);
    reply.header('content-type', 'image/svg+xml; charset=utf-8').header('content-disposition', `attachment; filename="${req.params.id}.svg"`);
    return sheetSvg(codes.map((c) => ({ url: shortLink(c.code), label: shortLink(c.code).replace(/^https?:\/\//, ''), caption })));
  });

  app.get('/v1/qr/:code', { schema: { tags: ['publisher'], params: Type.Object({ code: Type.String() }), querystring: Type.Object({ format: Type.Optional(Type.Union([Type.Literal('svg'), Type.Literal('png')])) }) } }, async (req, reply) => {
    const a = pub(req);
    const [c] = await database.tenant(a.tid, (tx) => tx.select().from(qrCodes).where(eq(qrCodes.code, req.params.code)));
    if (!c) throw notFound();
    const url = shortLink(c.code);
    if (req.query.format === 'png') return reply.header('content-type', 'image/png').send(await qrPng(url));
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').send(qrSvg(url, url.replace(/^https?:\/\//, '')));
  });

  /** Scans and completions per page, aggregated. */
  app.get('/v1/books/:id/stats', { schema: { tags: ['publisher'], params: Type.Object({ id: Type.String() }), querystring: Type.Object({ days: Type.Optional(Type.Integer({ minimum: 1, maximum: 730 })) }) } }, async (req) => {
    const a = pub(req);
    const since = new Date(Date.now() - (req.query.days ?? 90) * 864e5).toISOString().slice(0, 10);
    return database.tenant(a.tid, async (tx) => {
      const rows = await tx
        .select({ pageId: bookPages.id, chapter: bookPages.chapter, page: bookPages.page, label: bookPages.label, scans: sql<number>`coalesce(sum(${codeDailyCounts.scans}),0)::int`, completions: sql<number>`coalesce(sum(${codeDailyCounts.completions}),0)::int` })
        .from(bookPages)
        .leftJoin(pageLinks, eq(pageLinks.pageId, bookPages.id))
        .leftJoin(qrCodes, eq(qrCodes.pageLinkId, pageLinks.id))
        .leftJoin(codeDailyCounts, and(eq(codeDailyCounts.code, qrCodes.code), gte(codeDailyCounts.day, since)))
        .where(eq(bookPages.bookId, req.params.id))
        .groupBy(bookPages.id)
        .orderBy(asc(bookPages.chapter), asc(bookPages.page));
      return { since, pages: rows };
    });
  });

  /** Weekly abuse report: codes scanned far more than a printed page should be. */
  app.get('/v1/qr/suspicious', { schema: { tags: ['publisher'] } }, async (req) => {
    const a = pub(req);
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    return database.tenant(a.tid, async (tx) => {
      const rows = await tx
        .select({ code: qrCodes.code, type: qrCodes.type, scans: sql<number>`sum(${codeDailyCounts.scans})::int` })
        .from(qrCodes)
        .innerJoin(codeDailyCounts, eq(codeDailyCounts.code, qrCodes.code))
        .where(gte(codeDailyCounts.day, since))
        .groupBy(qrCodes.code);
      const limit: Record<string, number> = { copy: 30, book: 20000, public: 100000 };
      return { since, codes: rows.filter((r) => r.scans > (limit[r.type] ?? 1e9)) };
    });
  });
};
