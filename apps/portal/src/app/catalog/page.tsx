import Link from 'next/link';
import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { pick, t, type Key } from '@/lib/strings';
import { apiGet, type PackSummary } from '@/lib/server-api';

export const metadata: Metadata = { title: 'الرحلات · Trips' };

export default async function Catalog({ searchParams }: { searchParams: Promise<{ subject?: string; grade?: string; q?: string }> }) {
  const lang = await getLang();
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString();
  const data = await apiGet<{ packs: PackSummary[] }>(`/v1/packs${qs ? `?${qs}` : ''}`);
  const packs = data?.packs ?? [];
  const subjects = ['social-studies', 'science'];
  const grades = ['EG-P4', 'EG-P5', 'EG-P6'];
  return (
    <div className="r-stack">
      <h1>{t(lang, 'catalog.title')}</h1>
      <form className="r-card r-row" role="search">
        <label className="r-field">
          <span>{t(lang, 'catalog.subject')}</span>
          <select name="subject" defaultValue={sp.subject ?? ''} className="r-select">
            <option value="">{t(lang, 'catalog.any')}</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {t(lang, `subject.${s}` as Key)}
              </option>
            ))}
          </select>
        </label>
        <label className="r-field">
          <span>{t(lang, 'catalog.grade')}</span>
          <select name="grade" defaultValue={sp.grade ?? ''} className="r-select">
            <option value="">{t(lang, 'catalog.any')}</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="r-field" style={{ flex: 1, minInlineSize: 180 }}>
          <span>{t(lang, 'catalog.search')}</span>
          <input name="q" defaultValue={sp.q ?? ''} className="r-input" />
        </label>
        <button className="r-btn primary" type="submit" style={{ alignSelf: 'end' }}>
          {t(lang, 'catalog.search')}
        </button>
      </form>
      {packs.length ? (
        <div className="r-grid">
          {packs.map((p) => (
            <article key={p.id} className="r-card packcard">
              <div className={`poster ${p.subjects.includes('science') ? 'science' : ''}`} aria-hidden="true" />
              <h3>{pick(lang, p.title)}</h3>
              <p className="r-muted">
                {p.subjects.map((s) => t(lang, `subject.${s}` as Key)).join(' · ')} · {p.grades.join(' ')} · {t(lang, 'catalog.minutes', { n: p.durationMinutes })}
              </p>
              <p>{pick(lang, p.summary)}</p>
              <Link className="r-btn primary" href={`/packs/${p.id}`}>
                {t(lang, 'catalog.open')}
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="r-muted">{t(lang, 'catalog.empty')}</p>
      )}
    </div>
  );
}
