import type { Manifest } from '@rihla/pack-schema';

/** A photo or cartouche in the album (data URL, local only). */
export interface AlbumEntry {
  src: string;
  caption: string;
  captionKey?: string;
  t: number;
}

export interface SaveData {
  v: 1;
  packId: string;
  packVersion: string;
  name: string;
  color: number;
  locale?: string;
  flags: string[];
  counters: Record<string, string[]>;
  stamps: string[];
  questsDone: string[];
  titles: string[];
  seen: string[];
  updatedAt: number;
}

type Listener = () => void;

/**
 * Progress for one pack. Counters are *sets* (adding the same value twice counts once), which makes every
 * pickup idempotent and lets saves merge safely. `visit` counters and flags reset each time their scene is
 * entered (e.g. discoveries on a planet surface).
 */
export class GameState {
  name = '';
  color = 0;
  locale: string | undefined;
  flags = new Set<string>();
  counters = new Map<string, Set<string>>();
  stamps = new Set<string>();
  questsDone = new Set<string>();
  titles = new Set<string>();
  /** Persistent "seen once" marks (area facts, first dialogues). */
  seen = new Set<string>();
  /** Session-only marks (trigger once-per-session). */
  fired = new Set<string>();
  album: AlbumEntry[] = [];
  updatedAt = 0;
  private listeners = new Set<Listener>();
  private visitCounters: Set<string>;
  private visitFlags: Set<string>;
  private dirty = false;

  constructor(private manifest: Manifest) {
    this.visitCounters = new Set(manifest.counters.filter((c) => c.scope === 'visit').map((c) => c.id));
    this.visitFlags = new Set((manifest.flags ?? []).filter((f) => f.scope === 'visit').map((f) => f.id));
    for (const c of manifest.counters) this.counters.set(c.id, new Set());
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(): void {
    this.dirty = true;
    this.updatedAt = Date.now();
    for (const fn of this.listeners) fn();
  }
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  count(id: string): number {
    return this.counters.get(id)?.size ?? 0;
  }
  has(id: string, value: string): boolean {
    return this.counters.get(id)?.has(value) ?? false;
  }
  /** Returns true when the value was new. */
  add(id: string, value: string): boolean {
    let set = this.counters.get(id);
    if (!set) this.counters.set(id, (set = new Set()));
    if (set.has(value)) return false;
    set.add(value);
    this.changed();
    return true;
  }
  setFlag(id: string, value = true): boolean {
    if (this.flags.has(id) === value) return false;
    if (value) this.flags.add(id);
    else this.flags.delete(id);
    this.changed();
    return true;
  }
  giveStamp(id: string): boolean {
    if (this.stamps.has(id)) return false;
    this.stamps.add(id);
    this.changed();
    return true;
  }
  resetVisit(): void {
    let any = false;
    for (const id of this.visitCounters) {
      const s = this.counters.get(id);
      if (s && s.size) {
        s.clear();
        any = true;
      }
    }
    for (const f of this.visitFlags) if (this.flags.delete(f)) any = true;
    if (any) this.changed();
  }

  /** "Furthest progress wins" score used to resolve local vs cloud save conflicts. */
  progress(): number {
    let n = this.stamps.size * 10 + this.questsDone.size * 20 + this.flags.size;
    for (const [id, s] of this.counters) if (!this.visitCounters.has(id)) n += s.size;
    return n;
  }

  toSave(): SaveData {
    const counters: Record<string, string[]> = {};
    for (const [id, s] of this.counters) if (!this.visitCounters.has(id) && s.size) counters[id] = [...s];
    return {
      v: 1,
      packId: this.manifest.id,
      packVersion: this.manifest.version,
      name: this.name,
      color: this.color,
      ...(this.locale ? { locale: this.locale } : {}),
      flags: [...this.flags].filter((f) => !this.visitFlags.has(f)),
      counters,
      stamps: [...this.stamps],
      questsDone: [...this.questsDone],
      titles: [...this.titles],
      seen: [...this.seen],
      updatedAt: this.updatedAt || Date.now(),
    };
  }

  load(d: Partial<SaveData> | null | undefined): void {
    if (!d || typeof d !== 'object') return;
    const known = new Set(this.manifest.counters.map((c) => c.id));
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length < 80) : []);
    if (typeof d.name === 'string') this.name = d.name.slice(0, 16);
    if (Number.isInteger(d.color)) this.color = d.color!;
    if (typeof d.locale === 'string') this.locale = d.locale;
    this.flags = new Set(strs(d.flags));
    if (d.counters && typeof d.counters === 'object') {
      for (const [id, vals] of Object.entries(d.counters)) if (known.has(id) && !this.visitCounters.has(id)) this.counters.set(id, new Set(strs(vals)));
    }
    const stampIds = new Set(this.manifest.stamps.map((s) => s.id));
    this.stamps = new Set(strs(d.stamps).filter((s) => stampIds.has(s)));
    this.questsDone = new Set(strs(d.questsDone));
    this.titles = new Set(strs(d.titles));
    this.seen = new Set(strs(d.seen));
    this.updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : 0;
  }
}

/** Furthest progress wins; ties go to the most recent. */
export function pickSave(manifest: Manifest, a: SaveData | null, b: SaveData | null): SaveData | null {
  if (!a) return b;
  if (!b) return a;
  const sa = new GameState(manifest);
  sa.load(a);
  const sb = new GameState(manifest);
  sb.load(b);
  if (sa.progress() !== sb.progress()) return sa.progress() > sb.progress() ? a : b;
  return (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b;
}
