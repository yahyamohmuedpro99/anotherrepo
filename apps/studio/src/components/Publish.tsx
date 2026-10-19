import { useMemo, useState } from 'react';
import { createApi, ApiError } from '@rihla/api-client';
import { api as studioApi, useStudio } from '../lib/store';

interface Review { id: string; version: string; aspect: string; state: string; comment: string; at: string; byUser: string | null }

/** Review workflow (content, language, culture) and publishing an immutable version (BRIEF §8). */
export function Publish() {
  const { t, packId, files, report } = useStudio();
  const [token, setToken] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [msg, setMsg] = useState('');
  const client = useMemo(() => createApi({ baseUrl: '/api', token: () => token }), [token]);
  const version = (files['manifest.json'] as { version?: string } | undefined)?.version ?? '';
  const load = async () => {
    if (!packId) return;
    try {
      const r = await client.get<{ reviews: Review[] }>('/v1/packs/{id}/versions', { params: { id: packId } });
      setReviews(r.reviews);
    } catch (x) {
      setMsg(String((x as Error).message));
    }
  };
  const latest = (aspect: string) => reviews.find((r) => r.version === version && r.aspect === aspect);
  if (!token)
    return (
      <form
        className="r-card r-stack"
        style={{ maxInlineSize: 420 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const s = await client.post<{ accessToken: string }>('/v1/auth/login', { email: String(f.get('email')), password: String(f.get('password')) });
            setToken(s.accessToken);
            setTimeout(() => void load(), 0);
          } catch (x) {
            setMsg(String((x as Error).message));
          }
        }}
      >
        <h2>{t('apiLogin')}</h2>
        <label className="r-field"><span>{t('email')}</span><input className="r-input" name="email" type="email" dir="ltr" required /></label>
        <label className="r-field"><span>{t('password')}</span><input className="r-input" name="password" type="password" dir="ltr" required /></label>
        <button type="submit" className="r-btn primary">{t('login')}</button>
        {msg ? <p className="bad">{msg}</p> : null}
      </form>
    );
  return (
    <div className="r-stack">
      <h2>{t('reviews')} · <span dir="ltr">{packId}@{version}</span></h2>
      <table className="r-table">
        <thead><tr><th>{t('aspect')}</th><th>{t('state')}</th><th>{t('comment')}</th></tr></thead>
        <tbody>
          {(['content', 'language', 'culture'] as const).map((a) => {
            const r = latest(a);
            return <tr key={a}><td>{t(`aspect.${a}`)}</td><td className={r?.state === 'approved' ? 'good' : 'warn'}>{r?.state ?? 'draft'}</td><td>{r?.comment ?? ''}</td></tr>;
          })}
        </tbody>
      </table>
      <form
        className="r-card r-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await client.post('/v1/packs/{id}/versions/{version}/reviews', { aspect: String(f.get('aspect')) as 'content', state: String(f.get('state')) as 'approved', comment: String(f.get('comment')) }, { params: { id: packId!, version } });
            await load();
          } catch (x) {
            setMsg(String((x as Error).message));
          }
        }}
      >
        <div className="r-row">
          <select className="r-select" name="aspect" aria-label={t('aspect')}>{['content', 'language', 'culture'].map((a) => <option key={a} value={a}>{t(`aspect.${a}` as 'aspect.content')}</option>)}</select>
          <select className="r-select" name="state" aria-label={t('state')}>{['in-review', 'changes-requested', 'approved'].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <textarea className="r-textarea" name="comment" required aria-label={t('comment')} />
        <button type="submit" className="r-btn">{t('submitReview')}</button>
      </form>
      <button
        type="button"
        className="r-btn primary big"
        disabled={!report?.ok}
        onClick={async () => {
          try {
            setMsg('…');
            const built = await studioApi<{ bundle: unknown; teacher: Record<string, string> }>(`/packs/${packId}/build`, { method: 'POST' });
            const r = await client.post<{ version: string; hash: string }>('/v1/packs/{id}/versions', { bundle: built.bundle as never, teacher: built.teacher }, { params: { id: packId! } });
            setMsg(t('published', { v: `${r.version} (${r.hash})` }));
          } catch (x) {
            setMsg(x instanceof ApiError ? `${x.code}: ${x.message}` : String((x as Error).message));
          }
        }}
      >
        {t('publishNow', { v: version })}
      </button>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
