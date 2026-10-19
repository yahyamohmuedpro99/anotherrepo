import type { LearningVerb } from '@rihla/pack-schema/runtime';
import { storage } from './storage.js';

/** xAPI-shaped learning event: actor · verb · object · result · context. */
export interface LearningEvent {
  id: string;
  verb: LearningVerb;
  ts: string;
  actor: { deviceId: string; studentId?: string; classId?: string };
  object: { type: 'pack' | 'scene' | 'poi' | 'card' | 'item' | 'quest' | 'stamp' | 'photo'; id: string };
  result?: { correct?: boolean; attempt?: number; response?: string; score?: number; durationMs?: number; hints?: number };
  context: { packId: string; packVersion: string; locale: string; sceneId?: string; assignmentId?: string; sessionId?: string; objectives?: string[]; mode: 'guest' | 'student' | 'preview' };
}

const QUEUE_KEY = 'rihla.events.queue';

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function deviceId(): string {
  let id = storage.get('rihla.device');
  if (!id) {
    id = uuid();
    storage.set('rihla.device', id);
  }
  return id;
}

export interface TelemetryOptions {
  url?: string;
  headers?: () => Record<string, string>;
  sink?: (e: LearningEvent) => void;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  intervalMs?: number;
}

/**
 * One queue for every learning event. Events are persisted locally before sending, batched, retried with
 * backoff while offline, and flushed with sendBeacon on page hide. Nothing is dropped: if storage is full the
 * queue stays in memory until it can be sent.
 */
export class Telemetry {
  private queue: LearningEvent[] = [];
  private sending = false;
  private backoff = 0;
  private failures = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private base: Omit<LearningEvent, 'id' | 'verb' | 'ts' | 'object' | 'result'> | null = null;

  constructor(private opts: TelemetryOptions = {}) {
    try {
      const saved = JSON.parse(storage.get(QUEUE_KEY) ?? '[]');
      if (Array.isArray(saved)) this.queue = saved;
    } catch {
      /* ignore */
    }
  }

  setContext(base: Omit<LearningEvent, 'id' | 'verb' | 'ts' | 'object' | 'result'>): void {
    this.base = base;
  }
  patchContext(c: Partial<LearningEvent['context']>): void {
    if (this.base) this.base = { ...this.base, context: { ...this.base.context, ...c } };
  }

  start(): void {
    if (this.timer || !this.opts.url) return;
    this.timer = setInterval(() => void this.flush(), this.opts.intervalMs ?? 5000);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.beacon);
      window.addEventListener('online', () => void this.flush());
    }
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.beacon);
  }

  emit(verb: LearningVerb, object: LearningEvent['object'], result?: LearningEvent['result'], context?: Partial<LearningEvent['context']>): LearningEvent | null {
    if (!this.base) return null;
    const e: LearningEvent = {
      ...this.base,
      id: uuid(),
      verb,
      ts: new Date().toISOString(),
      object,
      ...(result ? { result } : {}),
      context: { ...this.base.context, ...(context ?? {}) },
    };
    this.queue.push(e);
    this.persist();
    try {
      this.opts.sink?.(e);
    } catch {
      /* host callback errors must not break play */
    }
    if (this.queue.length >= (this.opts.batchSize ?? 20)) void this.flush();
    return e;
  }

  pending(): number {
    return this.queue.length;
  }

  private persist(): void {
    storage.set(QUEUE_KEY, JSON.stringify(this.queue.slice(-5000)));
  }

  async flush(): Promise<boolean> {
    if (!this.opts.url || this.sending || !this.queue.length) return false;
    if (this.backoff > Date.now()) return false;
    this.sending = true;
    const batch = this.queue.slice(0, 100);
    try {
      const f = this.opts.fetchImpl ?? fetch;
      const res = await f(this.opts.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.opts.headers?.() ?? {}) },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      const sent = new Set(batch.map((e) => e.id));
      this.queue = this.queue.filter((e) => !sent.has(e.id));
      this.persist();
      this.backoff = 0;
      this.failures = 0;
      return true;
    } catch {
      this.backoff = Date.now() + Math.min(60000, 2000 * 2 ** this.failures);
      this.failures = Math.min(this.failures + 1, 6);
      return false;
    } finally {
      this.sending = false;
    }
  }

  private beacon = (): void => {
    if (!this.opts.url || !this.queue.length || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const ok = navigator.sendBeacon(this.opts.url, new Blob([JSON.stringify({ events: this.queue.slice(0, 100) })], { type: 'application/json' }));
    // The server de-duplicates by event id, so the queue is kept until a fetch confirms.
    void ok;
  };
}
