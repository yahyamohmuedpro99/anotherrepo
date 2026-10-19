/**
 * Demo data for pilots and local development (BRIEF §18): a platform admin, a demo school with an admin,
 * a teacher, a class with students and an assignment, a demo publisher with a book, page links and QR codes,
 * and both packs published through the API.
 *
 *   DATABASE_URL=… pnpm --filter @rihla/api seed
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPack } from '@rihla/pack-schema/node';
import { eq } from 'drizzle-orm';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase, type Database } from './db/client.js';
import { memberships, tenants, users } from './db/schema.js';
import { hashPassword } from './auth/passwords.js';

const ROOT = new URL('../../../', import.meta.url).pathname;
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'rihla-demo-2026';

export async function seed(database: Database, config = loadConfig()) {
  const app = await buildApp({ database, config });
  const call = async (method: string, url: string, token: string | null, payload?: unknown) => {
    const r = await app.inject({ method: method as 'GET', url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
    return r.json();
  };
  // platform tenant + admin are created directly (there is no one to invite them)
  const db = database.db;
  const existing = await db.select().from(users).where(eq(users.email, 'admin@rihla.local'));
  if (!existing.length) {
    await db.insert(tenants).values({ id: 'ten_platform', kind: 'platform', name: 'Rihla' });
    await db.insert(users).values({ id: 'usr_platform', email: 'admin@rihla.local', name: 'Rihla Admin', passwordHash: await hashPassword(DEMO_PASSWORD) });
    await db.insert(memberships).values([
      { userId: 'usr_platform', tenantId: 'ten_platform', role: 'platform_admin' },
      { userId: 'usr_platform', tenantId: 'ten_platform', role: 'author' },
      { userId: 'usr_platform', tenantId: 'ten_platform', role: 'reviewer' },
    ]);
  } else {
    console.log('seed: already seeded');
    await app.close();
    return null;
  }
  const admin = (await call('POST', '/v1/auth/login', null, { email: 'admin@rihla.local', password: DEMO_PASSWORD })).accessToken as string;

  // packs
  const out = mkdtempSync(path.join(tmpdir(), 'rihla-seed-'));
  for (const id of ['giza-plateau', 'solar-system']) {
    const built = await buildPack(path.join(ROOT, 'packs', id), out);
    const bundle = JSON.parse(readFileSync(built.bundlePath, 'utf8'));
    const teacher: Record<string, string> = {};
    for (const doc of ['lesson-plan', 'worksheet', 'answer-key']) {
      try {
        teacher[doc] = readFileSync(path.join(ROOT, 'packs', id, 'teacher', `${doc}.md`), 'utf8');
      } catch {
        /* optional */
      }
    }
    await call('POST', `/v1/packs/${id}/versions`, admin, { bundle, teacher, overrideReviews: 'Seed data for local development and pilots (reviews pending, see content/FACTCHECK.md)' });
  }

  // demo school
  const school = await call('POST', '/v1/tenants', admin, { kind: 'school', name: 'مدرسة النور التجريبية · Demo School', seats: 120, admin: { email: 'principal@demo.school', name: 'أ. سامية · Principal' } });
  const principal = (await call('POST', '/v1/auth/accept-invite', null, { token: school.invite.token, password: DEMO_PASSWORD })).accessToken as string;
  const teacherInvite = await call('POST', '/v1/invites', principal, { email: 'teacher@demo.school', name: 'أ. كريم · Mr Karim', role: 'teacher' });
  const teacher = (await call('POST', '/v1/auth/accept-invite', null, { token: teacherInvite.token, password: DEMO_PASSWORD })).accessToken as string;
  const cls = (await call('POST', '/v1/classes', teacher, { name: 'رابعة ب · Grade 4B', grade: 'P4' })).class;
  await call('POST', `/v1/classes/${cls.id}/students`, teacher, { names: ['صقر أزرق', 'نجم دهبي', 'نخلة شجاع', 'قمر ذكي', 'هلال سريع'] });
  const asg = (await call('POST', `/v1/classes/${cls.id}/assignments`, teacher, { packId: 'giza-plateau', poiId: 'poi.sphinx', preQuiz: true, postQuiz: true })).assignment;

  // demo publisher
  const pub = await call('POST', '/v1/tenants', admin, { kind: 'publisher', name: 'دار المعرفة التجريبية · Demo Publisher', admin: { email: 'editor@demo.publisher', name: 'أ. هالة · Editor' } });
  const editor = (await call('POST', '/v1/auth/accept-invite', null, { token: pub.invite.token, password: DEMO_PASSWORD })).accessToken as string;
  const book = (await call('POST', '/v1/books', editor, { title: 'الدراسات الاجتماعية · الصف الرابع', grade: 'P4', subject: 'social-studies' })).book;
  const page = (await call('POST', `/v1/books/${book.id}/pages`, editor, { chapter: 'الوحدة ١', page: '24', label: 'أهرامات الجيزة' })).page;
  const link = (await call('POST', `/v1/pages/${page.id}/links`, editor, { packId: 'giza-plateau', poiId: 'poi.khufu' })).link;
  const batch = await call('POST', '/v1/qr-batches', editor, { type: 'book', pageLinkId: link.id });

  await app.close();
  return { classCode: cls.joinCode, assignment: asg.id, qr: batch.shortLinks[0] as string, logins: ['admin@rihla.local', 'principal@demo.school', 'teacher@demo.school', 'editor@demo.publisher'] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const database = await createDatabase(config.databaseUrl);
  await database.migrate();
  await database.useAppRole();
  const r = await seed(database, config);
  if (r) {
    console.log(`Seeded. Password for every demo login: ${DEMO_PASSWORD}`);
    console.log(`  logins: ${r.logins.join(', ')}`);
    console.log(`  class join code: ${r.classCode}   assignment: ${r.assignment}`);
    console.log(`  printed QR short link: ${r.qr}`);
  }
  await database.close();
}
