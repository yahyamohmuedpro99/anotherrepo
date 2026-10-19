import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadPack, validatePack, type PackData, type ValidationReport } from '@rihla/pack-schema/full';
import { fmt, type Lang, type SKey } from './strings';

export type Files = Record<string, unknown>;

export interface Selection {
  path: string;
  /** For scenes: index into entities. */
  entity?: number;
}

interface StudioCtx {
  lang: Lang;
  setLang(l: Lang): void;
  t(k: SKey, p?: Record<string, string | number>): string;
  packId: string | null;
  open(id: string): Promise<void>;
  files: Files;
  media: string[];
  dirty: Set<string>;
  set(path: string, value: unknown): void;
  save(path?: string): Promise<void>;
  selection: Selection | null;
  select(s: Selection | null): void;
  /** In-memory pack (unsaved edits included) for validation and translations. */
  pack: PackData | null;
  report: ValidationReport | null;
  revalidate(): Promise<void>;
  locales: string[];
  previewNonce: number;
  bumpPreview(): void;
}

const Ctx = createContext<StudioCtx | null>(null);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/studio-api${path}`, init);
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? String(res.status));
  return body as T;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('studio.lang') === 'en' ? 'en' : 'ar'));
  const [packId, setPackId] = useState<string | null>(null);
  const [files, setFiles] = useState<Files>({});
  const [media, setMedia] = useState<string[]>([]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [selection, select] = useState<Selection | null>(null);
  const [pack, setPack] = useState<PackData | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [previewNonce, setNonce] = useState(0);

  const build = useCallback(async (f: Files) => {
    try {
      const p = await loadPack(async (rel) => {
        if (!(rel in f)) throw new Error(`missing ${rel}`);
        return structuredClone(f[rel]);
      });
      setPack(p);
      setReport(validatePack(p, { files: Object.keys(f).map((path) => ({ path, bytes: JSON.stringify(f[path]).length })) }));
    } catch (e) {
      setPack(null);
      setReport({ pack: packId ?? '', version: '', ok: false, errors: [{ rule: 'schema', severity: 'error', file: 'manifest.json', message: String((e as Error).message) }], warnings: [], stats: { files: 0, downloadMB: 0, keys: 0, scenes: {}, reachableScenes: [] }, checklist: [] });
    }
  }, [packId]);

  const open = useCallback(async (id: string) => {
    const r = await api<{ files: Files; media: string[] }>(`/packs/${id}/files`);
    setPackId(id);
    setFiles(r.files);
    setMedia(r.media);
    setDirty(new Set());
    select(null);
    await build(r.files);
  }, [build]);

  const value: StudioCtx = {
    lang,
    setLang: (l) => {
      localStorage.setItem('studio.lang', l);
      setLang(l);
    },
    t: (k, p) => fmt(lang, k, p),
    packId,
    open,
    files,
    media,
    dirty,
    set(path, v) {
      setFiles((f) => ({ ...f, [path]: v }));
      setDirty((d) => new Set(d).add(path));
    },
    async save(path) {
      const list = path ? [path] : [...dirty];
      for (const p of list) {
        const v = files[p];
        await api(`/packs/${packId}/file?path=${encodeURIComponent(p)}`, { method: 'PUT', body: typeof v === 'string' ? v : JSON.stringify(v) });
      }
      setDirty((d) => {
        const n = new Set(d);
        for (const p of list) n.delete(p);
        return n;
      });
      await build(files);
      setNonce((x) => x + 1);
    },
    selection,
    select,
    pack,
    report,
    revalidate: () => build(files),
    locales: useMemo(() => ((files['manifest.json'] as { locales?: string[] } | undefined)?.locales ?? ['ar-EG', 'en']), [files]),
    previewNonce,
    bumpPreview: () => setNonce((x) => x + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStudio outside provider');
  return c;
}

/** Locale file path for a locale code. */
export const localePath = (l: string) => `locales/${l}.json`;
