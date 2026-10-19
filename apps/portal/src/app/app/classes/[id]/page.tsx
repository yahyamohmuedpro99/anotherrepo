'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Select, Table, TextArea } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

const PLAYER = process.env.NEXT_PUBLIC_PLAYER_URL ?? 'http://localhost:5173';

interface Klass { id: string; name: string; grade: string | null; joinCode: string; namePolicy: 'list' | 'typed'; chatAllowed: boolean; archivedAt: string | null }
interface Student { id: string; displayName: string; nameStatus: 'approved' | 'pending' | 'rejected' }
interface Assignment { id: string; packId: string; packVersion: string; poiId: string | null; dueAt: string | null; hints: boolean; preQuiz: boolean; postQuiz: boolean; createdAt: string; link: string }
interface PackRow { id: string; title: Record<string, string> }
interface PackDetail { pois: { id: string; title: Record<string, string> }[] }

function AssignForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const { t, pick } = useLang();
  const { api } = useSession();
  const packs = useData(() => api.get<{ packs: PackRow[] }>('/v1/packs'), [api]);
  const [packId, setPackId] = useState('');
  const detail = useData(() => (packId ? api.get<PackDetail>('/v1/packs/{id}', { params: { id: packId } }) : Promise.resolve(null)), [api, packId]);
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      className="r-card r-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api.post('/v1/classes/{id}/assignments', {
            packId,
            poiId: String(f.get('poi') || '') || undefined,
            dueAt: f.get('due') ? new Date(String(f.get('due'))).toISOString() : undefined,
            hints: f.get('hints') === 'on',
            preQuiz: f.get('pre') === 'on',
            postQuiz: f.get('post') === 'on',
          }, { params: { id: classId } });
          onDone();
        } catch (x) {
          setErr(x);
        }
      }}
    >
      <h3>{t('class.assign')}</h3>
      <ErrorLine error={err} />
      <Field label={t('class.pack')}>
        <Select required value={packId} onChange={(e) => setPackId(e.target.value)}>
          <option value="" disabled>—</option>
          {(packs.data?.packs ?? []).map((p) => (
            <option key={p.id} value={p.id}>{pick(p.title)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('class.poi')}>
        <Select name="poi" defaultValue="">
          <option value="">{t('class.start')}</option>
          {(detail.data?.pois ?? []).map((p) => (
            <option key={p.id} value={p.id}>{pick(p.title)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('class.due')}>
        <Input name="due" type="date" />
      </Field>
      <label className="r-row"><input type="checkbox" name="hints" defaultChecked /> {t('class.hints')}</label>
      <label className="r-row"><input type="checkbox" name="pre" /> {t('class.pre')}</label>
      <label className="r-row"><input type="checkbox" name="post" /> {t('class.post')}</label>
      <Button type="submit" tone="primary" disabled={!packId}>{t('class.assign')}</Button>
    </form>
  );
}

function ClassPage({ id }: { id: string }) {
  const { t, n } = useLang();
  const { api } = useSession();
  const router = useRouter();
  const cls = useData(() => api.get<{ class: Klass }>('/v1/classes/{id}', { params: { id } }), [api, id]);
  const roster = useData(() => api.get<{ students: Student[] }>('/v1/classes/{id}/students', { params: { id } }), [api, id]);
  const consent = useData(() => api.get<{ students: { id: string; consent: boolean }[] }>('/v1/classes/{id}/consent', { params: { id } }), [api, id]);
  const asg = useData(() => api.get<{ assignments: Assignment[] }>('/v1/classes/{id}/assignments', { params: { id } }), [api, id]);
  const [err, setErr] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const c = cls.data?.class;
  const has = new Map((consent.data?.students ?? []).map((s) => [s.id, s.consent]));
  const act = async (fn: () => Promise<unknown>, after: () => void) => {
    try {
      setErr(null);
      await fn();
      after();
    } catch (x) {
      setErr(x);
    }
  };
  if (!c) return <ErrorLine error={cls.error} />;
  const joinUrl = `${PLAYER.replace(/^https?:\/\//, '')}/c/${c.joinCode}`;
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <h1>{c.name}</h1>
      <ErrorLine error={err} />
      <section className="r-card r-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>{t('class.code')}</h2>
          <div className="r-code" aria-label={c.joinCode.split('').join(' ')}>{c.joinCode}</div>
          <p className="r-muted">{t('class.codeHint')} <span className="r-ltr">{joinUrl}</span></p>
        </div>
        <div className="r-stack noprint">
          <Button onClick={() => act(() => api.post('/v1/classes/{id}/code', undefined, { params: { id } }), cls.reload)}>{t('class.newCode')}</Button>
          <Button
            tone="primary"
            big
            onClick={() =>
              act(async () => {
                const latest = asg.data?.assignments[0];
                const r = await api.post<{ session: { id: string }; roomToken: string }>('/v1/sessions', { classId: id, ...(latest ? { assignmentId: latest.id } : {}) });
                sessionStorage.setItem(`room:${r.session.id}`, r.roomToken);
                router.push(`/app/sessions/${r.session.id}`);
              }, () => undefined)
            }
          >
            {t('class.live')}
          </Button>
        </div>
      </section>

      <section className="r-stack">
        <h2>{t('class.assignments')}</h2>
        <Table
          head={[t('class.pack'), t('class.poi'), t('class.due'), t('class.link'), '']}
          rows={(asg.data?.assignments ?? []).map((a) => [
            `${a.packId}@${a.packVersion}`,
            a.poiId ?? t('class.start'),
            a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '—',
            <a key="l" className="r-ltr" href={a.link}>{a.link.replace(/^https?:\/\//, '')}</a>,
            <Link key="r" className="r-btn primary" href={`/app/assignments/${a.id}`}>{t('class.report')}</Link>,
          ])}
          empty={t('common.none')}
        />
        <AssignForm classId={id} onDone={asg.reload} />
      </section>

      <section className="r-stack">
        <h2>{t('class.roster')} <span className="r-muted">({n(roster.data?.students.length ?? 0)})</span></h2>
        <Table
          head={[t('report.student'), t('common.status'), t('class.consent'), '']}
          rows={(roster.data?.students ?? []).map((s) => [
            s.displayName,
            s.nameStatus === 'pending' ? (
              <span key="p" className="r-row">
                <Badge tone="warn">{t('class.pending')}</Badge>
                <Button onClick={() => act(() => api.patch('/v1/students/{id}', { nameStatus: 'approved' }, { params: { id: s.id } }), roster.reload)}>{t('class.approve')}</Button>
                <Button tone="danger" onClick={() => act(() => api.patch('/v1/students/{id}', { nameStatus: 'rejected' }, { params: { id: s.id } }), roster.reload)}>{t('class.reject')}</Button>
              </span>
            ) : (
              <Badge key="s" tone={s.nameStatus === 'approved' ? 'ok' : 'warn'}>{s.nameStatus}</Badge>
            ),
            has.get(s.id) ? (
              <Badge key="c" tone="ok">{t('class.consentYes')}</Badge>
            ) : (
              <Button
                key="c"
                onClick={() => {
                  const by = prompt(t('class.consentBy'));
                  const where = by ? prompt(t('class.consentWhere')) : null;
                  if (by && where) void act(() => api.post('/v1/students/{id}/consent', { givenBy: by, evidence: where }, { params: { id: s.id } }), consent.reload);
                }}
              >
                {t('class.consentRecord')}
              </Button>
            ),
            <Button key="d" tone="danger" onClick={() => confirm(t('class.removeConfirm')) && void act(() => api.del('/v1/students/{id}', { params: { id: s.id } }), () => setTimeout(roster.reload, 1500))}>{t('class.remove')}</Button>,
          ])}
          empty={t('common.none')}
        />
        <form
          className="r-card r-stack noprint"
          onSubmit={async (e) => {
            e.preventDefault();
            const text = String(new FormData(e.currentTarget).get('names'));
            await act(async () => {
              const r = await api.post<{ added: string[]; rejected: { name: string }[] }>('/v1/classes/{id}/students', { names: text.split('\n').map((x) => x.trim()).filter(Boolean) }, { params: { id } });
              setMsg(r.rejected.length ? t('class.rejected', { names: r.rejected.map((x) => x.name).join('، ') }) : '');
            }, roster.reload);
          }}
        >
          <Field label={t('class.import')}>
            <TextArea name="names" />
          </Field>
          {msg ? <p className="r-muted">{msg}</p> : null}
          <Button type="submit">{t('class.add')}</Button>
        </form>
      </section>

      <Card title="⋯">
        <div className="toolbar">
          <Button onClick={() => act(() => api.post('/v1/data-requests', { subjectKind: 'class', subjectId: id, kind: 'export' }), () => setMsg(t('common.done')))}>{t('class.export')}</Button>
          <Button tone="danger" onClick={() => act(() => api.patch('/v1/classes/{id}', { archived: true }, { params: { id } }), () => router.push('/app'))}>{t('class.archive')}</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Guard roles={['teacher', 'school_admin']}>
      <ClassPage id={id} />
    </Guard>
  );
}
