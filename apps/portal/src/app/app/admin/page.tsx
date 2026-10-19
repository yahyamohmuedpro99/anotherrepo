'use client';
import { useState } from 'react';
import { Button, Field, Input, Notice, Select, Table } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface Tenant { id: string; kind: string; name: string; seats: number; region: string; createdAt: string }
interface PackRow { id: string; title: Record<string, string>; currentVersion: string }

function PackVersions({ pack, onChange }: { pack: PackRow; onChange: () => void }) {
  const { t } = useLang();
  const { api } = useSession();
  const v = useData(() => api.get<{ versions: { version: string; status: string }[] }>('/v1/packs/{id}/versions', { params: { id: pack.id } }), [api, pack.id]);
  return (
    <span className="r-row">
      {(v.data?.versions ?? []).map((x) => (
        <Button key={x.version} tone={x.version === pack.currentVersion ? 'gold' : 'default'} disabled={x.version === pack.currentVersion || x.status !== 'published'} onClick={async () => {
          await api.post('/v1/packs/{id}/current', { version: x.version }, { params: { id: pack.id } });
          onChange();
        }}>
          {x.version}{x.version === pack.currentVersion ? ` · ${t('admin.current')}` : ''}
        </Button>
      ))}
    </span>
  );
}

function Admin() {
  const { t, pick } = useLang();
  const { api } = useSession();
  const tenants = useData(() => api.get<{ tenants: Tenant[] }>('/v1/tenants'), [api]);
  const packs = useData(() => api.get<{ packs: PackRow[] }>('/v1/packs'), [api]);
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <h1>{t('app.admin')}</h1>
      <ErrorLine error={err ?? tenants.error} />
      <section className="r-stack">
        <h2>{t('admin.tenants')}</h2>
        <Table head={[t('school.name'), t('admin.kind'), t('school.seats'), 'Region']} rows={(tenants.data?.tenants ?? []).map((x) => [x.name, x.kind, String(x.seats), x.region])} />
        <form className="r-card r-row" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await api.post<{ invite: { inviteUrl: string } | null }>('/v1/tenants', {
              kind: f.get('kind') === 'publisher' ? 'publisher' : 'school',
              name: String(f.get('name')),
              seats: Number(f.get('seats') || 0),
              admin: { email: String(f.get('email')), name: String(f.get('adminName')) },
            });
            setInvite(r.invite?.inviteUrl ?? '');
            tenants.reload();
          } catch (x) { setErr(x); }
        }}>
          <Field label={t('school.name')}><Input name="name" required /></Field>
          <Field label={t('admin.kind')}><Select name="kind"><option value="school">{t('admin.kind.school')}</option><option value="publisher">{t('admin.kind.publisher')}</option></Select></Field>
          <Field label={t('school.seats')}><Input name="seats" type="number" min={0} defaultValue={0} style={{ inlineSize: 100 }} /></Field>
          <Field label={t('admin.adminName')}><Input name="adminName" required /></Field>
          <Field label={t('admin.adminEmail')}><Input name="email" type="email" required dir="ltr" /></Field>
          <Button type="submit" tone="primary" style={{ alignSelf: 'end' }}>{t('admin.newTenant')}</Button>
        </form>
        {invite ? <Notice>{t('school.inviteLink')} <span className="r-ltr">{invite}</span></Notice> : null}
      </section>
      <section className="r-stack">
        <h2>{t('admin.packs')}</h2>
        <Table head={[t('class.pack'), t('admin.current')]} rows={(packs.data?.packs ?? []).map((p) => [pick(p.title), <PackVersions key={p.id} pack={p} onChange={packs.reload} />])} />
      </section>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['platform_admin']}><Admin /></Guard>;
}
