import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { pick, t, type Key } from '@/lib/strings';
import { apiGet, PLAYER_URL, type PackDetail } from '@/lib/server-api';
import { markdown } from '@/lib/markdown';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await apiGet<PackDetail>(`/v1/packs/${(await params).id}`);
  return { title: d ? `${d.pack.title['ar-EG'] ?? ''} · ${d.pack.title.en ?? ''}` : 'Rihla' };
}

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const d = await apiGet<PackDetail>(`/v1/packs/${encodeURIComponent(id)}`);
  if (!d) notFound();
  const plan = await apiGet<string>(`/v1/packs/${encodeURIComponent(id)}/teacher/lesson-plan`, 300);
  const sample = `${PLAYER_URL}/play/${d.pack.id}${lang === 'en' ? '?lang=en' : ''}`;
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <section className="hero">
        <p className="r-row" style={{ gap: 6, opacity: 0.9 }}>
          {d.pack.subjects.map((s) => t(lang, `subject.${s}` as Key)).join(' · ')} · {d.pack.grades.join(' ')} · {t(lang, 'catalog.minutes', { n: d.pack.durationMinutes })}
        </p>
        <h1>{pick(lang, d.pack.title)}</h1>
        <p>{pick(lang, d.pack.summary)}</p>
        <div className="r-row">
          <a className="r-btn gold big" href={sample}>
            {t(lang, 'pack.try')}
          </a>
          <a className="r-btn" href={`${sample}${sample.includes('?') ? '&' : '?'}mode=2d`}>
            {t(lang, 'pack.cards')}
          </a>
        </div>
      </section>
      <div className="r-grid">
        <section className="r-card">
          <h2>{t(lang, 'pack.objectives')}</h2>
          <ul>
            {d.objectives.map((o) => (
              <li key={o.id}>{pick(lang, o.text)}</li>
            ))}
          </ul>
          <p className="r-muted">{t(lang, 'pack.items', { n: d.itemCount })}</p>
        </section>
        <section className="r-card">
          <h2>{t(lang, 'pack.stops')}</h2>
          <ul>
            {d.pois.map((p) => (
              <li key={p.id}>{pick(lang, p.title)}</li>
            ))}
          </ul>
        </section>
        <section className="r-card">
          <h2>{t(lang, 'pack.curriculum')}</h2>
          <ul>
            {d.curriculum.map((c, i) => (
              <li key={i}>
                {c.country} · {c.grade} · {c.subject} {c.lesson.startsWith('TODO') ? <span className="r-muted">— {t(lang, 'pack.curriculumTodo')}</span> : `· ${c.lesson}`}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {plan ? (
        <section className="r-card md" dir="auto">
          <h2>{t(lang, 'pack.lessonPlan')}</h2>
          <div dangerouslySetInnerHTML={{ __html: markdown(plan) }} />
        </section>
      ) : null}
    </div>
  );
}
