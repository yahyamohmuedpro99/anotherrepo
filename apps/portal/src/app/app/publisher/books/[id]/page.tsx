'use client';
import { use, useState } from 'react';
import { Button, Field, Input, Select, Table } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { download, useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface Link { id: string; packId: string; poiId: string }
interface Page { id: string; chapter: string; page: string; label: string; links: Link[] }
interface PackRow { id: string; title: Record<string, string> }
interface Pois { pois: { id: string; title: Record<string, string> }[] }
interface Batch { id: string; type: string; count: number; pageLinkId: string | null; createdAt: string }

function LinkForm({ onSave, initial }: { onSave: (packId: string, poiId: string) => Promise<void>; initial?: Link }) {
  const { t, pick } = useLang();
  const { api } = useSession();
  const packs = useData(() => api.get<{ packs: PackRow[] }>('/v1/packs'), [api]);
  const [packId, setPackId] = useState(initial?.packId ?? '');
  const [poiId, setPoiId] = useState(initial?.poiId ?? '');
  const pois = useData(() => (packId ? api.get<Pois>('/v1/packs/{id}', { params: { id: packId } }) : Promise.resolve(null)), [api, packId]);
  return (
    <span className="r-row">
      <Select aria-label={t('class.pack')} value={packId} onChange={(e) => (setPackId(e.target.value), setPoiId(''))}>
        <option value="">—</option>
        {(packs.data?.packs ?? []).map((p) => <option key={p.id} value={p.id}>{pick(p.title)}</option>)}
      </Select>
      <Select aria-label={t('class.poi')} value={poiId} onChange={(e) => setPoiId(e.target.value)}>
        <option value="">—</option>
        {(pois.data?.pois ?? []).map((p) => <option key={p.id} value={p.id}>{pick(p.title)}</option>)}
      </Select>
      <Button tone="primary" disabled={!packId || !poiId} onClick={() => void onSave(packId, poiId)}>{initial ? t('pub.relink') : t('pub.link')}</Button>
    </span>
  );
}

function BookView({ id }: { id: string }) {
  const { t, n } = useLang();
  const { api, session } = useSession();
  const book = useData(() => api.get<{ book: { title: string }; pages: Page[] }>('/v1/books/{id}', { params: { id } }), [api, id]);
  const stats = useData(() => api.get<{ pages: { pageId: string; scans: number; completions: number }[] }>('/v1/books/{id}/stats', { params: { id } }), [api, id]);
  const batches = useData(() => api.get<{ batches: Batch[] }>('/v1/qr-batches'), [api]);
  const [err, setErr] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    try { setErr(null); await fn(); after(); } catch (x) { setErr(x); }
  };
  const statOf = (pageId: string) => stats.data?.pages.find((p) => p.pageId === pageId);
  const tok = session?.accessToken ?? null;
  if (!book.data) return <ErrorLine error={book.error} />;
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <h1>{book.data.book.title}</h1>
      <ErrorLine error={err} />
      <Table
        head={[t('pub.chapter'), t('pub.page'), t('pub.label'), t('pub.link'), t('pub.qr'), t('pub.scans'), t('pub.completions')]}
        rows={book.data.pages.map((p) => {
          const link = p.links[0];
          const myBatches = (batches.data?.batches ?? []).filter((b) => link && b.pageLinkId === link.id);
          return [
            p.chapter,
            p.page,
            p.label,
            link ? (
              <div key="l" className="r-stack" style={{ gap: 4 }}>
                <span className="r-ltr">{link.packId} · {link.poiId}</span>
                <LinkForm initial={link} onSave={(packId, poiId) => run(() => api.patch('/v1/links/{id}', { packId, poiId }, { params: { id: link.id } }), book.reload)} />
              </div>
            ) : (
              <LinkForm key="l" onSave={(packId, poiId) => run(() => api.post('/v1/pages/{id}/links', { packId, poiId }, { params: { id: p.id } }), book.reload)} />
            ),
            link ? (
              <div key="q" className="r-stack" style={{ gap: 6 }}>
                {myBatches.map((b) => (
                  <span key={b.id} className="r-row">
                    <span>{t(`pub.qr.${b.type}` as 'pub.qr.book')} · {n(b.count)}</span>
                    <Button onClick={() => void download(api.url('/v1/qr-batches/{id}/sheet.svg', { id: b.id }), tok, `${b.id}.svg`)}>{t('pub.sheet')}</Button>
                    <Button onClick={() => void download(api.url('/v1/qr-batches/{id}/codes.csv', { id: b.id }), tok, `${b.id}.csv`)}>{t('pub.csv')}</Button>
                  </span>
                ))}
                <form className="r-row" onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const type = String(f.get('type')) as 'public' | 'book' | 'copy';
                  void run(() => api.post('/v1/qr-batches', { type, pageLinkId: link.id, ...(type === 'copy' ? { count: Number(f.get('count') || 1) } : {}) }), batches.reload);
                }}>
                  <Select name="type" aria-label={t('pub.qrType')} defaultValue="book">
                    <option value="book">{t('pub.qr.book')}</option>
                    <option value="copy">{t('pub.qr.copy')}</option>
                    <option value="public">{t('pub.qr.public')}</option>
                  </Select>
                  <Input name="count" type="number" min={1} max={5000} defaultValue={1} aria-label={t('pub.count')} style={{ inlineSize: 100 }} />
                  <Button type="submit">{t('pub.make')}</Button>
                </form>
              </div>
            ) : '—',
            n(statOf(p.id)?.scans ?? 0),
            n(statOf(p.id)?.completions ?? 0),
          ];
        })}
        empty={t('common.none')}
      />
      <p className="r-muted">{t('pub.stats')}</p>
      <form className="r-card r-row" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() => api.post('/v1/books/{id}/pages', { chapter: String(f.get('chapter')), page: String(f.get('page')), label: String(f.get('label') || '') }, { params: { id } }), book.reload);
        (e.target as HTMLFormElement).reset();
      }}>
        <Field label={t('pub.chapter')}><Input name="chapter" required /></Field>
        <Field label={t('pub.page')}><Input name="page" required style={{ inlineSize: 90 }} /></Field>
        <Field label={t('pub.label')}><Input name="label" /></Field>
        <Button type="submit" tone="primary" style={{ alignSelf: 'end' }}>{t('pub.addPage')}</Button>
      </form>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Guard roles={['publisher_admin']}><BookView id={id} /></Guard>;
}
