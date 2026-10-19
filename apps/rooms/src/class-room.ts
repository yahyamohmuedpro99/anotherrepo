import { Room, type Client } from 'colyseus';
import { verifyRoom, type RoomClaims } from './tokens.js';

/** Teacher commands the engine understands (packages/engine/src/gameplay/teacher.ts). */
const TEACHER = new Set(['pause', 'resume', 'lockMovement', 'gather', 'spotlight', 'pushQuestion', 'end']);
/** Preset phrases only (BRIEF §10); the engine shows them in the student's language. */
export const PHRASES = new Set(['come', 'found', 'help', 'look', 'wait']);
const EMOTES = new Set(['wave', 'cheer', 'point']);

export const LIMITS = { students: 40, teachers: 2, minutes: 90, hz: 10 };

export interface RoomDeps {
  secret: string;
  /** Moderation and safety log, stored by the API for 30 days (BRIEF §10). */
  log(entry: { tenantId: string; sessionId: string; actor: string; action: string; target?: string; detail?: Record<string, unknown> }): void;
  ended(tenantId: string, sessionId: string): void;
}

interface Pose {
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  scene: string;
}

/**
 * One room per live session. Students see each other's display name, colour, position and emotes; nothing
 * else. Teachers can pause, gather, spotlight, lock movement, push a question, mute, remove and end.
 */
export class ClassRoom extends Room {
  static deps: RoomDeps;
  private sid = '';
  private tid = '';
  private poses = new Map<string, Pose>();
  private muted = new Set<string>();
  private removed = new Set<string>();
  private allMuted = false;
  private lastPhrase = new Map<string, number>();
  override maxClients = LIMITS.students + LIMITS.teachers;

  override onCreate(options: { sid?: string }) {
    this.sid = String(options.sid ?? '');
    this.autoDispose = true;
    this.clock.setTimeout(() => this.finish('time-limit'), LIMITS.minutes * 60_000);
    this.clock.setInterval(() => this.snapshot(), 1000 / LIMITS.hz);

    this.onMessage('pos', (client, m: { x: number; y: number; z: number; scene: string }) => {
      const a = client.auth as RoomClaims;
      if (a.role !== 'student' || !Number.isFinite(m?.x) || !Number.isFinite(m?.y) || !Number.isFinite(m?.z)) return;
      this.poses.set(client.sessionId, { name: a.name, color: a.color, x: +m.x, y: +m.y, z: +m.z, scene: String(m.scene ?? '').slice(0, 40) });
    });
    this.onMessage('phrase', (client, m: { key: string }) => {
      const a = client.auth as RoomClaims;
      if (!PHRASES.has(m?.key) || this.allMuted || this.muted.has(a.sub)) return;
      const now = Date.now();
      if (now - (this.lastPhrase.get(client.sessionId) ?? 0) < 2000) return;
      this.lastPhrase.set(client.sessionId, now);
      this.broadcast('phrase', { from: client.sessionId, key: m.key });
    });
    this.onMessage('emote', (client, m: { kind: string }) => {
      if (!EMOTES.has(m?.kind)) return;
      this.broadcast('emote', { from: client.sessionId, kind: m.kind }, { except: client });
    });
    // free-text chat is not offered in v1 rooms; refuse it explicitly so a modified client gains nothing
    this.onMessage('chat', () => {});
    this.onMessage('teacher', (client, cmd: { type: string } & Record<string, unknown>) => {
      const a = client.auth as RoomClaims;
      if (a.role !== 'teacher' || !TEACHER.has(cmd?.type)) return;
      this.broadcast('teacher', cmd);
      ClassRoom.deps.log({ tenantId: this.tid, sessionId: this.sid, actor: a.sub, action: `teacher.${cmd.type}`, detail: cmd });
      if (cmd.type === 'end') this.finish('teacher-ended');
    });
    this.onMessage('moderate', (client, m: { action: 'mute' | 'unmute' | 'remove' | 'mute-all' | 'unmute-all'; studentId?: string }) => {
      const a = client.auth as RoomClaims;
      if (a.role !== 'teacher') return;
      const target = m.studentId ?? '';
      if (m.action === 'mute') this.muted.add(target);
      if (m.action === 'unmute') this.muted.delete(target);
      if (m.action === 'mute-all') this.allMuted = true;
      if (m.action === 'unmute-all') this.allMuted = false;
      if (m.action === 'remove') {
        this.removed.add(target);
        for (const c of this.clients) if ((c.auth as RoomClaims).sub === target) c.leave(4003);
      }
      ClassRoom.deps.log({ tenantId: this.tid, sessionId: this.sid, actor: a.sub, action: `moderation.${m.action}`, ...(target ? { target } : {}) });
      this.sendRoster();
    });
  }

  override async onAuth(_client: Client, options: { token?: string }) {
    const a = await verifyRoom(String(options.token ?? ''), ClassRoom.deps.secret);
    if (!a || a.sid !== this.sid) throw new Error('not allowed in this room');
    if (this.removed.has(a.sub)) throw new Error('removed by the teacher');
    const n = this.clients.filter((c) => (c.auth as RoomClaims | undefined)?.role === a.role).length;
    if (a.role === 'student' && n >= LIMITS.students) throw new Error('room full');
    if (a.role === 'teacher' && n >= LIMITS.teachers) throw new Error('room full');
    this.tid = a.tid;
    return a;
  }

  override onJoin(client: Client) {
    const a = client.auth as RoomClaims;
    ClassRoom.deps.log({ tenantId: this.tid, sessionId: this.sid, actor: a.sub, action: 'joined', detail: { role: a.role } });
    this.sendRoster();
  }

  override onLeave(client: Client) {
    this.poses.delete(client.sessionId);
    this.sendRoster();
  }

  override onDispose() {
    if (this.tid) ClassRoom.deps.ended(this.tid, this.sid);
  }

  private finish(reason: string) {
    if (this.tid) ClassRoom.deps.log({ tenantId: this.tid, sessionId: this.sid, actor: 'system', action: 'ended', detail: { reason } });
    this.broadcast('teacher', { type: 'end' });
    this.clock.setTimeout(() => void this.disconnect(), 500);
  }

  private snapshot() {
    if (!this.clients.length) return;
    this.broadcast('peers', Object.fromEntries(this.poses));
  }

  /** Teachers get the roster with mute state; students never see ids. */
  private sendRoster() {
    const roster = this.clients.map((c) => {
      const a = c.auth as RoomClaims | undefined;
      return { sessionId: c.sessionId, studentId: a?.sub, name: a?.name, role: a?.role, muted: !!a && this.muted.has(a.sub) };
    });
    for (const c of this.clients) if ((c.auth as RoomClaims | undefined)?.role === 'teacher') c.send('roster', { roster, allMuted: this.allMuted });
  }
}
