import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { Client, type Room } from 'colyseus.js';
import { buildRooms } from '../src/server.js';
import type { RoomClaims } from '../src/tokens.js';

const SECRET = 'test-room-secret';
const logs: { action: string; actor: string; target?: string }[] = [];
const ended: string[] = [];
let port = 0;
let stop: () => Promise<void>;

const token = (c: Partial<RoomClaims> & { sub: string; role: 'student' | 'teacher' }) =>
  new SignJWT({ kind: 'room', sid: 'ses_1', tid: 'ten_1', cid: 'cls_1', name: c.sub, color: '#2f63b0', chat: false, ...c })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('rihla-api')
    .setAudience('rooms')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));

const next = <T>(room: Room, type: string, pred: (m: T) => boolean = () => true, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${type}`)), ms);
    room.onMessage(type, (m: T) => {
      if (pred(m)) {
        clearTimeout(t);
        resolve(m);
      }
    });
  });

beforeAll(async () => {
  const { http, game } = buildRooms({ secret: SECRET, log: (e) => logs.push(e), ended: (_t, s) => ended.push(s) });
  await new Promise<void>((r) => http.listen(0, r));
  port = (http.address() as { port: number }).port;
  stop = async () => {
    await game.gracefullyShutdown(false);
  };
});
afterAll(async () => stop?.());

describe('class room', () => {
  it('shares positions at 10 Hz, relays preset phrases and teacher commands, enforces removal', async () => {
    const client = new Client(`ws://localhost:${port}`);
    const teacher = await client.joinOrCreate('class', { token: await token({ sub: 'usr_t', role: 'teacher' }), sid: 'ses_1' });
    const a = await client.joinOrCreate('class', { token: await token({ sub: 'stu_a', role: 'student', name: 'صقر أزرق' }), sid: 'ses_1' });
    const b = await client.joinOrCreate('class', { token: await token({ sub: 'stu_b', role: 'student', name: 'نجم دهبي' }), sid: 'ses_1' });
    expect(a.roomId).toBe(teacher.roomId);
    expect(b.roomId).toBe(teacher.roomId);
    for (const r of [teacher, a, b]) r.onMessage('*', () => {});

    a.send('pos', { x: 1, y: 2, z: 3, scene: 'plateau' });
    const peers = await next<Record<string, { name: string; x: number }>>(b, 'peers', (m) => !!m[a.sessionId]);
    expect(peers[a.sessionId]).toMatchObject({ name: 'صقر أزرق', x: 1 });

    const phrase = next<{ from: string; key: string }>(b, 'phrase');
    a.send('phrase', { key: 'found' });
    expect(await phrase).toEqual({ from: a.sessionId, key: 'found' });

    // free text and unknown phrases never reach anyone
    let leaked = false;
    b.onMessage('chat', () => (leaked = true));
    a.send('chat', { text: 'hello' });
    a.send('phrase', { key: 'my phone number is…' });

    // students cannot send teacher commands
    let paused = false;
    b.onMessage('teacher', () => (paused = true));
    a.send('teacher', { type: 'pause' });
    await new Promise((r) => setTimeout(r, 300));
    expect(paused).toBe(false);
    expect(leaked).toBe(false);

    const cmd = next<{ type: string }>(a, 'teacher');
    teacher.send('teacher', { type: 'gather', poiId: 'poi.sphinx' });
    expect(await cmd).toEqual({ type: 'gather', poiId: 'poi.sphinx' });

    const left = new Promise<number>((r) => b.onLeave((code) => r(code)));
    teacher.send('moderate', { action: 'remove', studentId: 'stu_b' });
    expect(await left).toBe(4003);
    await expect(client.joinOrCreate('class', { token: await token({ sub: 'stu_b', role: 'student' }), sid: 'ses_1' })).rejects.toThrow();
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['joined', 'teacher.gather', 'moderation.remove']));

    const end = next<{ type: string }>(a, 'teacher', (m) => m.type === 'end');
    teacher.send('teacher', { type: 'end' });
    await end;
    await new Promise((r) => setTimeout(r, 900));
    expect(ended).toContain('ses_1');
  });

  it('rejects tokens for another session or signed with another key', async () => {
    const client = new Client(`ws://localhost:${port}`);
    await expect(client.joinOrCreate('class', { token: await token({ sub: 'stu_x', role: 'student', sid: 'ses_other' }), sid: 'ses_2' })).rejects.toThrow();
    const forged = await new SignJWT({ kind: 'room', sid: 'ses_2', role: 'teacher', sub: 'x' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('rihla-api').setAudience('rooms').sign(new TextEncoder().encode('wrong'));
    await expect(client.joinOrCreate('class', { token: forged, sid: 'ses_2' })).rejects.toThrow();
  });
});
