/** localStorage that never throws (private windows, blocked storage, quota). */
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      globalThis.localStorage?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  json<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
};

/** Passport stamps carry across every pack (BRIEF §4 "shown across the whole catalog"). */
export const passport = {
  all(): Record<string, string[]> {
    return storage.json<Record<string, string[]>>('rihla.passport', {});
  },
  add(packId: string, stampId: string): void {
    const p = passport.all();
    const list = new Set(p[packId] ?? []);
    list.add(stampId);
    p[packId] = [...list];
    storage.set('rihla.passport', JSON.stringify(p));
  },
};
