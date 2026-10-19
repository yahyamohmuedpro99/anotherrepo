'use client';
import { useState } from 'react';
import { Button, Card, Field, Input, Notice, Select, Stat, Table } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';
import type { Key } from '@/lib/strings';

interface TenantInfo { tenant: { id: string; name: string; seats: number; contractStart: string | null; contractEnd: string | null; region: string; retentionDays: number }; seatsUsed: number }
interface Member { id: string; name: string; email: string; role: string }
interface Request { id: string; subjectKind: string; subjectId: string; kind: string; status: string; createdAt: string }
interface AuditEntry { id: number; action: string; target: string | null; actorId: string | null; at: string }

function School() {
  const { t, n } = useLang();
  const { api, session } = useSession();
  const info = useData(() => api.get<TenantInfo>('/v1/tenant'), [api]);
  const members = useData(() => api.get<{ members: Member[]; pending: { email: string; role: string }[] }>('/v1/members'), [api]);
  const reqs = useData(() => api.get<{ requests: Request[] }>('/v1/data-requests'), [api]);
  const audit = useData(() => api.get<{ entries: AuditEntry[] }>('/v1/audit', { query: { limit: 50 } }), [api]);
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const tn = info.data?.tenant;
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <h1>{t('school.title')} · {tn?.name}</h1>
      <ErrorLine error={err ?? info.error} />
      <div className="r-grid">
        <Card><Stat label={t('school.seats')} value={tn ? t('school.seatsUsed', { used: info.data!.seatsUsed, total: tn.seats }) : '…'} /></Card>
        <Card><Stat label={t('school.contract')} value={tn?.contractEnd ? new Date(tn.contractEnd).toLocaleDateString() : '—'} /></Card>
        <Card><Stat label="Region" value={<span className="r-ltr">{tn?.region.toUpperCase()} · {n(tn?.retentionDays ?? 0)}d</span>} /></Card>
      </div>
      <section className="r-stack">
        <h2>{t('school.members')}</h2>
        <Table
          head={[t('school.name'), 'Email', t('school.role'), '']}
          rows={(members.data?.members ?? []).map((m) => [
            m.name,
            <span key="e" className="r-ltr">{m.email}</span>,
            t(`role.${m.role}` as Key),
            m.id === session?.user.id ? '' : (
              <Button key="d" tone="danger" onClick={async () => {
                try { await api.del('/v1/members/{userId}', { params: { userId: m.id } }); members.reload(); } catch (x) { setErr(x); }
              }}>{t('school.deactivate')}</Button>
            ),
          ])}
        />
        <form className="r-card r-row" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await api.post<{ inviteUrl: string }>('/v1/invites', { email: String(f.get('email')), name: String(f.get('name')), role: f.get('role') === 'school_admin' ? 'school_admin' : 'teacher' });
            setInvite(r.inviteUrl);
            members.reload();
          } catch (x) { setErr(x); }
        }}>
          <Field label={t('school.name')}><Input name="name" required /></Field>
          <Field label="Email"><Input name="email" type="email" required dir="ltr" /></Field>
          <Field label={t('school.role')}>
            <Select name="role"><option value="teacher">{t('role.teacher')}</option><option value="school_admin">{t('role.school_admin')}</option></Select>
          </Field>
          <Button type="submit" tone="primary" style={{ alignSelf: 'end' }}>{t('school.invite')}</Button>
        </form>
        {invite ? <Notice>{t('school.inviteLink')} <span className="r-ltr">{invite}</span></Notice> : null}
      </section>
      <section className="r-stack">
        <h2>{t('school.requests')}</h2>
        <Table head={[t('common.date'), 'Kind', 'Subject', t('common.status')]} rows={(reqs.data?.requests ?? []).map((r) => [new Date(r.createdAt).toLocaleString(), r.kind, `${r.subjectKind}`, r.status])} empty={t('common.none')} />
        <div><Button onClick={async () => {
          try { await api.post('/v1/data-requests', { subjectKind: 'tenant', subjectId: tn!.id, kind: 'export' }); reqs.reload(); } catch (x) { setErr(x); }
        }}>{t('school.exportAll')}</Button></div>
      </section>
      <section className="r-stack">
        <h2>{t('school.audit')}</h2>
        <Table head={[t('common.date'), 'Action', 'Target']} rows={(audit.data?.entries ?? []).map((a) => [new Date(a.at).toLocaleString(), <code key="a">{a.action}</code>, <span key="t" className="r-ltr">{a.target ?? ''}</span>])} />
      </section>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['school_admin']}><School /></Guard>;
}
