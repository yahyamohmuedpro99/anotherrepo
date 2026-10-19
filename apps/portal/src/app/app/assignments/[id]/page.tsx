'use client';
import { use } from 'react';
import { Badge, Bar, Button, Notice, Table } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { download, useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface Report {
  assignment: { id: string; packId: string; packVersion: string };
  pack: { title: Record<string, string> };
  objectives: { id: string; text: Record<string, string>; pre: number | null; play: number | null; post: number | null }[];
  students: { id: string; name: string; completed: boolean; activeMinutes: number; stamps: number; hints: number; objectives: Record<string, { correct: number; items: number }>; pre: number | null; post: number | null }[];
  items: { id: string; prompt: Record<string, string>; answered: number; correctRate: number | null; firstTryRate: number | null; commonWrong: { response: string; n: number }[] }[];
}

function ReportView({ id }: { id: string }) {
  const { t, n, pick, lang } = useLang();
  const { api, session } = useSession();
  const { data, error } = useData(() => api.get<Report>('/v1/assignments/{id}/report', { params: { id } }), [api, id]);
  if (!data) return <ErrorLine error={error} />;
  const pct = (v: number | null) => (v === null ? '—' : `${n(v)}٪`.replace('٪', lang === 'ar' ? '٪' : '%'));
  const anyResults = data.students.some((s) => Object.keys(s.objectives).length || s.completed);
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <div className="r-row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('report.title')} · {pick(data.pack.title)}</h1>
        <Button tone="primary" onClick={() => void download(api.url('/v1/assignments/{id}/report.csv', { id }) + `?lang=${lang}`, session?.accessToken ?? null, `report-${id}.csv`)}>
          {t('report.csv')}
        </Button>
      </div>
      {!anyResults ? <Notice>{t('report.empty')}</Notice> : null}
      <section className="r-card r-stack">
        <h2>{t('report.objectives')}</h2>
        {data.objectives.map((o) => (
          <div key={o.id} className="r-stack" style={{ gap: 6 }}>
            <b>{pick(o.text)}</b>
            <div className="r-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <Bar label={t('report.pre')} value={o.pre} />
              <Bar label={t('report.play')} value={o.play} />
              <Bar label={t('report.post')} value={o.post} />
            </div>
          </div>
        ))}
      </section>
      <section className="r-stack">
        <h2>{t('report.students')}</h2>
        <Table
          head={[t('report.student'), t('report.done'), t('report.minutes'), t('report.hints'), t('report.pre'), t('report.post'), ...data.objectives.map((o) => <abbr key={o.id} title={pick(o.text)}>{o.id.replace('obj.', '')}</abbr>)]}
          rows={data.students.map((s) => [
            s.name,
            s.completed ? <Badge key="d" tone="ok">{t('report.yes')}</Badge> : t('report.no'),
            n(s.activeMinutes),
            n(s.hints),
            pct(s.pre),
            pct(s.post),
            ...data.objectives.map((o) => {
              const x = s.objectives[o.id];
              return x ? `${n(x.correct)}/${n(x.items)}` : '—';
            }),
          ])}
        />
      </section>
      <section className="r-stack">
        <h2>{t('report.items')}</h2>
        <Table
          head={[t('report.items'), t('report.correct'), t('report.firstTry'), t('report.wrong')]}
          rows={data.items.map((i) => [pick(i.prompt) || i.id, pct(i.correctRate), pct(i.firstTryRate), i.commonWrong[0] ? `${i.commonWrong[0].response} (${n(i.commonWrong[0].n)})` : '—'])}
          empty={t('common.none')}
        />
      </section>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Guard roles={['teacher', 'school_admin']}>
      <ReportView id={id} />
    </Guard>
  );
}
