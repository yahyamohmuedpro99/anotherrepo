const BASE = (import.meta.env.VITE_PACKS_BASE as string | undefined) ?? '/packs';

/**
 * Built packs live at /packs/{id}/index.json → immutable bundle.<hash>.json (one request, cache forever).
 * In development the raw pack folder is served instead.
 */
export async function packUrlFor(id: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/${id}/index.json`, { cache: 'no-cache' });
    if (res.ok) {
      const idx = (await res.json()) as { latest?: string; versions?: Record<string, { bundle: string }> };
      const v = idx.latest && idx.versions?.[idx.latest];
      if (v) return `${BASE}/${id}/${v.bundle}`;
    }
  } catch {
    /* offline: the service worker answers from cache, or we fall back to the folder */
  }
  return `${BASE}/${id}/`;
}

/** Put the pack title on the loading shell as early as possible. */
export async function preloadTitle(packUrl: string, locale?: string): Promise<string | null> {
  if (packUrl.endsWith('.json')) {
    const dir = packUrl.replace(/[^/]*$/, '');
    try {
      const m = (await (await fetch(`${dir}manifest.json`)).json()) as { title: string; defaultLocale: string };
      const loc = (await (await fetch(`${dir}locales/${locale ?? m.defaultLocale}.json`)).json()) as Record<string, string>;
      return loc[m.title] ?? null;
    } catch {
      return null;
    }
  }
  try {
    const m = (await (await fetch(`${packUrl}manifest.json`)).json()) as { title: string; defaultLocale: string };
    const loc = (await (await fetch(`${packUrl}locales/${locale ?? m.defaultLocale}.json`)).json()) as Record<string, string>;
    return loc[m.title] ?? null;
  } catch {
    return null;
  }
}
