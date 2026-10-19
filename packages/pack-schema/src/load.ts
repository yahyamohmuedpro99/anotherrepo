import type {
  Card,
  CompositeModel,
  Dialogue,
  GlyphAlphabet,
  Item,
  Licenses,
  Manifest,
  Overlay,
  Poi,
  Quest,
  Scene,
} from './schema.js';

export type LocaleStrings = Record<string, string>;

/** Everything in a pack, parsed, keyed by id. Produced from a folder or from a built bundle. */
export interface PackData {
  base: string;
  manifest: Manifest;
  scenes: Record<string, Scene>;
  pois: Record<string, Poi>;
  quests: Record<string, Quest>;
  items: Record<string, Item>;
  cards: Record<string, Card>;
  dialogues: Record<string, Dialogue>;
  models: Record<string, CompositeModel>;
  glyphs: Record<string, GlyphAlphabet>;
  locales: Record<string, LocaleStrings>;
  overlays: Record<string, { overlay: Overlay; strings: LocaleStrings }>;
  licenses: Licenses | null;
  /** Relative path → parsed JSON, for every file loaded (the validator reports against these paths). */
  raw: Record<string, unknown>;
}

export interface PackBundle {
  format: 'rihla-pack-bundle@1';
  id: string;
  version: string;
  hash: string;
  builtAt: string;
  files: Record<string, unknown>;
  /** Non-JSON assets: relative path → content-hashed file name next to the bundle. */
  assets: Record<string, string>;
}

export type JsonFetcher = (relativePath: string) => Promise<unknown>;

const GROUPS = ['pois', 'quests', 'items', 'cards', 'dialogues', 'models', 'glyphs'] as const;

/** Loads a pack through any fetcher (HTTP, filesystem, in-memory bundle). */
export async function loadPack(fetchJson: JsonFetcher, base = ''): Promise<PackData> {
  const raw: Record<string, unknown> = {};
  const get = async <T>(p: string): Promise<T> => {
    const v = await fetchJson(p);
    raw[p] = v;
    return v as T;
  };
  const manifest = await get<Manifest>('manifest.json');
  const data: PackData = {
    base,
    manifest,
    scenes: {},
    pois: {},
    quests: {},
    items: {},
    cards: {},
    dialogues: {},
    models: {},
    glyphs: {},
    locales: {},
    overlays: {},
    licenses: null,
    raw,
  };
  const jobs: Promise<void>[] = [];
  for (const p of manifest.scenes ?? []) {
    jobs.push(get<Scene>(p).then((s) => void (data.scenes[s.id] = s)));
  }
  for (const g of GROUPS) {
    const list = (manifest[g] ?? []) as string[];
    for (const p of list) {
      jobs.push(
        get<{ id: string }>(p).then((v) => {
          (data[g] as Record<string, unknown>)[v.id] = v;
        }),
      );
    }
  }
  for (const loc of manifest.locales ?? []) {
    jobs.push(get<LocaleStrings>(`locales/${loc}.json`).then((v) => void (data.locales[loc] = v)));
  }
  for (const o of manifest.overlays ?? []) {
    jobs.push(
      get<Overlay>(o.path).then(async (ov) => {
        const dir = o.path.replace(/[^/]+$/, '');
        const strings = ov.strings ? await get<LocaleStrings>(dir + ov.strings) : {};
        data.overlays[o.locale] = { overlay: ov, strings };
      }),
    );
  }
  jobs.push(
    get<Licenses>('LICENSES.json')
      .then((v) => void (data.licenses = v))
      .catch(() => {
        delete raw['LICENSES.json'];
      }),
  );
  await Promise.all(jobs);
  return data;
}

/** A fetcher over a built bundle (one HTTP request for the whole pack). */
export function bundleFetcher(bundle: PackBundle): JsonFetcher {
  return async (p) => {
    if (!(p in bundle.files)) throw new Error(`Missing in bundle: ${p}`);
    return bundle.files[p];
  };
}

/** Resolve a locale (possibly an overlay locale such as ar-SA) to merged strings. */
export function stringsFor(pack: PackData, locale: string): LocaleStrings {
  const ov = pack.overlays[locale];
  if (ov) return { ...(pack.locales[ov.overlay.base] ?? {}), ...ov.strings };
  return pack.locales[locale] ?? pack.locales[pack.manifest.defaultLocale] ?? {};
}
