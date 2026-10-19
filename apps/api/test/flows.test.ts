import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness, answered, verb, type Harness } from './helpers.js';
import { aggregateEvents, drain, handlers } from '../src/jobs/index.js';

let h: Harness;
beforeAll(async () => {
  h = await harness();
}, 120_000);
afterAll(async () => h?.close());

describe('Flow B: teacher assigns, students play, report per objective', () => {
  it('joins with the class code, records answers and reports per objective and as CSV', async () => {
    const code = h.seeded.classCode;
    const resolved = await h.call('GET', `/v1/codes/${code}/resolve`);
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ type: 'class', packId: 'giza-plateau', poiId: 'poi.sphinx', namePolicy: 'list' });
    expect(resolved.body.suggestions.length).toBeGreaterThan(3);

    const name = resolved.body.suggestions[0];
    const join = await h.call('POST', '/v1/join', null, { code, displayName: name });
    expect(join.status).toBe(200);
    expect(join.body.assignment.id).toBe(h.seeded.assignment);
    const tok = join.body.token as string;
    const asg = h.seeded.assignment;

    const ev = [
      answered('item.sphinx', false, 1, { assignmentId: asg, phase: 'pre', response: 'west' }),
      answered('item.khufu', false, 1, { assignmentId: asg, response: 'item.khufu.o1' }),
      answered('item.khufu', true, 2, { assignmentId: asg }),
      answered('item.sphinx', true, 1, { assignmentId: asg }),
      answered('item.sphinx', true, 1, { assignmentId: asg, phase: 'post' }),
    ];
    expect((await h.call('POST', '/v1/events', tok, { events: ev })).status).toBe(200);
    // re-sending the same batch (offline queue retry) is a no-op
    expect((await h.call('POST', '/v1/events', tok, { events: ev })).status).toBe(200);
    // the ingest endpoint schedules aggregation 15 s out; run it now
    await aggregateEvents(h.database);

    const teacher = await h.login('teacher@demo.school');
    const rep = await h.call('GET', `/v1/assignments/${asg}/report`, teacher);
    expect(rep.status).toBe(200);
    const me = rep.body.students.find((s: { name: string }) => s.name === name);
    expect(me.objectives['obj.sphinx']).toEqual({ correct: 1, items: 1 });
    expect(me.objectives['obj.scale']).toEqual({ correct: 1, items: 1 });
    expect(me.pre).toBe(0);
    expect(me.post).toBe(100);
    const khufu = rep.body.items.find((i: { id: string }) => i.id === 'item.khufu');
    expect(khufu.firstTryRate).toBe(0);
    expect(khufu.commonWrong[0]).toEqual({ response: 'item.khufu.o1', n: 1 });
    const sphinxObj = rep.body.objectives.find((o: { id: string }) => o.id === 'obj.sphinx');
    expect(sphinxObj).toMatchObject({ pre: 0, play: 100, post: 100 });

    const csv = await h.call('GET', `/v1/assignments/${asg}/report.csv`, teacher);
    expect(csv.status).toBe(200);
    expect(csv.text.startsWith('﻿"student"')).toBe(true);
    expect(csv.text).toContain(name);
  });

  it('refuses names outside the list when the class uses the list policy', async () => {
    const r = await h.call('POST', '/v1/join', null, { code: h.seeded.classCode, displayName: 'Ahmed Mohamed' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('name-not-in-list');
  });

  it('filters bad display names in Arabic, Franco-Arabic and English', async () => {
    const t = await h.login('teacher@demo.school');
    const cls = (await h.call('GET', '/v1/classes', t)).body.classes[0];
    const r = await h.call('POST', `/v1/classes/${cls.id}/students`, t, { names: ['ك ـس', 'a7a', 'Sh1t', 'www.x.com', 'ليلى'] });
    expect(r.body.added).toEqual(['ليلى']);
    expect(r.body.rejected).toHaveLength(4);
  });
});

describe('tenant isolation', () => {
  it('a teacher of one school cannot read another school\'s class, assignment or report', async () => {
    const admin = await h.login('admin@rihla.local');
    const other = await h.call('POST', '/v1/tenants', admin, { kind: 'school', name: 'Other School', admin: { email: 'p@other.school', name: 'P' } });
    const accept = await h.call('POST', '/v1/auth/accept-invite', null, { token: other.body.invite.token, password: 'long-enough-password' });
    const outsider = accept.body.accessToken as string;
    const teacher = await h.login('teacher@demo.school');
    const cls = (await h.call('GET', '/v1/classes', teacher)).body.classes[0];

    expect((await h.call('GET', '/v1/classes', outsider)).body.classes).toEqual([]);
    expect((await h.call('GET', `/v1/classes/${cls.id}/students`, outsider)).status).toBe(404);
    expect((await h.call('GET', `/v1/assignments/${h.seeded.assignment}/report`, outsider)).status).toBe(404);
    expect((await h.call('PATCH', `/v1/classes/${cls.id}`, outsider, { name: 'mine now' })).status).toBe(404);
  });

  it('row-level security hides other tenants\' rows even from a query that forgets to filter', async () => {
    const { classes } = await import('../src/db/schema.js');
    expect(await h.database.db.select().from(classes)).toEqual([]);
    expect((await h.database.tenant('ten_nope', (tx) => tx.select().from(classes))).length).toBe(0);
    expect((await h.database.system((tx) => tx.select().from(classes))).length).toBeGreaterThan(0);
  });
});

describe('Flow A and C: printed QR codes', () => {
  it('a short link redirects to the deep link and counts the scan', async () => {
    const short = h.seeded.qr; // https://r.test/<code>
    const code = short.split('/').pop()!;
    const r = await h.call('GET', `/s/${code}`);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(`https://play.test/x/giza-plateau/poi.khufu?c=${code}`);
    const res = await h.call('GET', `/v1/codes/${code}/resolve`, null, undefined, { 'x-device-id': 'device-a' });
    expect(res.body).toMatchObject({ type: 'book', packId: 'giza-plateau', poiId: 'poi.khufu', access: 'full' });
    // a guest completion from that code is counted for the publisher, nothing else stored
    await h.call('POST', '/v1/events', null, { events: [verb('completed', 'pack', 'giza-plateau', { code })] });
    const editor = await h.login('editor@demo.publisher');
    const books = (await h.call('GET', '/v1/books', editor)).body.books;
    const stats = await h.call('GET', `/v1/books/${books[0].id}/stats`, editor);
    expect(stats.body.pages[0]).toMatchObject({ scans: 2, completions: 1 });
  });

  it('unknown codes never dead-end', async () => {
    const r = await h.call('GET', '/s/zzzzzzz');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('https://play.test/');
  });

  it('per-copy codes activate on the first device only', async () => {
    const editor = await h.login('editor@demo.publisher');
    const b = await h.call('POST', '/v1/qr-batches', editor, { type: 'copy', packId: 'solar-system', poiId: 'poi.mars', count: 3 });
    expect(b.status).toBe(200);
    const code = b.body.codes[0];
    expect((await h.call('GET', `/v1/codes/${code}/resolve`, null, undefined, { 'x-device-id': 'phone-1' })).body.access).toBe('full');
    expect((await h.call('GET', `/v1/codes/${code}/resolve`, null, undefined, { 'x-device-id': 'phone-1' })).body.access).toBe('full');
    expect((await h.call('GET', `/v1/codes/${code}/resolve`, null, undefined, { 'x-device-id': 'phone-2' })).body.access).toBe('sample');
    const sheet = await h.call('GET', `/v1/qr-batches/${b.body.batch.id}/sheet.svg`, editor);
    expect(sheet.status).toBe(200);
    expect(sheet.text).toContain('<svg');
    expect(sheet.text).toContain(`r.test/${code}`);
  });

  it('relinking a page re-points codes that are already printed', async () => {
    const editor = await h.login('editor@demo.publisher');
    const book = (await h.call('GET', '/v1/books', editor)).body.books[0];
    const detail = await h.call('GET', `/v1/books/${book.id}`, editor);
    const link = detail.body.pages[0].links[0];
    const r = await h.call('PATCH', `/v1/links/${link.id}`, editor, { packId: 'giza-plateau', poiId: 'poi.sphinx' });
    expect(r.body.codesUpdated).toBe(1);
    const code = h.seeded.qr.split('/').pop()!;
    expect((await h.call('GET', `/v1/codes/${code}/resolve`)).body.poiId).toBe('poi.sphinx');
  });
});

describe('guests', () => {
  it('stores counts only, never guest events', async () => {
    const { events, packDailyCounts } = await import('../src/db/schema.js');
    const before = (await h.database.system((tx) => tx.select().from(events))).length;
    await h.call('POST', '/v1/events', null, { events: [verb('launched', 'pack', 'giza-plateau'), verb('visited-poi', 'poi', 'poi.khufu')] });
    expect((await h.database.system((tx) => tx.select().from(events))).length).toBe(before);
    const counts = await h.database.db.select().from(packDailyCounts);
    expect(counts.find((c) => c.verb === 'launched')?.n).toBeGreaterThanOrEqual(1);
  });
});

describe('packs', () => {
  it('lists the catalog and refuses to overwrite a published version', async () => {
    const cat = await h.call('GET', '/v1/packs');
    expect(cat.body.packs.map((p: { id: string }) => p.id).sort()).toEqual(['giza-plateau', 'solar-system']);
    const d = await h.call('GET', '/v1/packs/solar-system');
    expect(d.body.objectives.length).toBe(5);
    const author = await h.login('admin@rihla.local');
    const fake = { format: 'rihla-pack-bundle@1', id: 'giza-plateau', version: '1.0.0', hash: 'different', builtAt: '', files: {}, assets: {} };
    const r = await h.call('POST', '/v1/packs/giza-plateau/versions', author, { bundle: fake });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('serves the lesson plan publicly and the answer key only to staff', async () => {
    expect((await h.call('GET', '/v1/packs/giza-plateau/teacher/lesson-plan')).status).toBe(200);
    expect((await h.call('GET', '/v1/packs/giza-plateau/teacher/answer-key')).status).toBe(401);
  });
});

describe('compliance', () => {
  it('exports and then deletes one student, leaving an audit trail', async () => {
    const teacher = await h.login('teacher@demo.school');
    const cls = (await h.call('GET', '/v1/classes', teacher)).body.classes[0];
    const roster = (await h.call('GET', `/v1/classes/${cls.id}/students`, teacher)).body.students;
    const target = roster.find((s: { displayName: string }) => s.displayName === 'قمر ذكي');
    const consent = await h.call('POST', `/v1/students/${target.id}/consent`, teacher, { givenBy: 'Parent', evidence: 'Form #12 in the school office' });
    expect(consent.status).toBe(200);

    const ex = await h.call('POST', '/v1/data-requests', teacher, { subjectKind: 'student', subjectId: target.id, kind: 'export' });
    await drain(h.database, handlers);
    const done = await h.call('GET', `/v1/data-requests/${ex.body.request.id}`, teacher);
    expect(done.body.request.status).toBe('done');
    expect(done.body.request.result.students[0].consent).toHaveLength(1);

    const del = await h.call('DELETE', `/v1/students/${target.id}`, teacher);
    expect(del.status).toBe(200);
    await drain(h.database, handlers);
    const after = (await h.call('GET', `/v1/classes/${cls.id}/students`, teacher)).body.students;
    expect(after.find((s: { id: string }) => s.id === target.id)).toBeUndefined();

    const principal = await h.login('principal@demo.school');
    const audit = await h.call('GET', '/v1/audit', principal);
    expect(audit.body.entries.some((e: { action: string }) => e.action === 'data.deleted.student')).toBe(true);
  });

  it('retention removes old events and moderation logs', async () => {
    const { runRetention } = await import('../src/jobs/index.js');
    const r = await runRetention(h.database);
    expect(r).toHaveProperty('events');
  });
});

describe('auth', () => {
  it('rotates refresh tokens and rejects reuse', async () => {
    const r = await h.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'teacher@demo.school', password: 'rihla-demo-2026' } });
    const cookie = String(r.headers['set-cookie']).split(';')[0]!;
    const r2 = await h.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie } });
    expect(r2.statusCode).toBe(200);
    const r3 = await h.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie } });
    expect(r3.statusCode).toBe(401);
  });

  it('gives the same answer for unknown email and wrong password', async () => {
    const a = await h.call('POST', '/v1/auth/login', null, { email: 'nobody@x.y', password: 'whatever-123' });
    const b = await h.call('POST', '/v1/auth/login', null, { email: 'teacher@demo.school', password: 'wrong-password-1' });
    expect(a.status).toBe(401);
    expect(b.body).toEqual(a.body);
  });

  it('issues room tokens only for an active session of the student\'s class', async () => {
    const teacher = await h.login('teacher@demo.school');
    const cls = (await h.call('GET', '/v1/classes', teacher)).body.classes[0];
    const join = await h.call('POST', '/v1/join', null, { code: cls.joinCode, displayName: 'نجم دهبي' });
    const stu = join.body.token as string;
    expect((await h.call('GET', '/v1/student/room', stu)).body.roomToken).toBeNull();
    const ses = await h.call('POST', '/v1/sessions', teacher, { classId: cls.id });
    expect(ses.body.roomToken).toBeTruthy();
    const room = await h.call('GET', '/v1/student/room', stu);
    const { verifyRoom } = await import('../src/auth/tokens.js');
    const claims = await verifyRoom(room.body.roomToken, h.config.roomSecret);
    expect(claims).toMatchObject({ role: 'student', sid: ses.body.session.id, name: 'نجم دهبي', chat: false });
    await h.call('POST', `/v1/sessions/${ses.body.session.id}/end`, teacher);
    expect((await h.call('GET', '/v1/student/room', stu)).body.roomToken).toBeNull();
  });
});
