'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Field, Input, Select } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  joinCode: string;
  students: number;
}

function Classes() {
  const { t } = useLang();
  const { api } = useSession();
  const { data, error, reload } = useData(() => api.get<{ classes: ClassRow[] }>('/v1/classes'), [api]);
  const [err, setErr] = useState<unknown>(null);
  return (
    <section className="r-stack">
      <h2>{t('app.classes')}</h2>
      <ErrorLine error={error ?? err} />
      <div className="r-grid">
        {(data?.classes ?? []).map((c) => (
          <Card key={c.id} title={c.name} actions={<Link className="r-btn primary" href={`/app/classes/${c.id}`}>{t('app.open')}</Link>}>
            <p className="r-muted">
              {c.grade ? `${c.grade} · ` : ''}
              {t('app.students', { n: c.students })} · <span className="r-ltr">{c.joinCode}</span>
            </p>
          </Card>
        ))}
        <form
          className="r-card r-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api.post('/v1/classes', { name: String(f.get('name')), grade: String(f.get('grade') || '') || undefined, namePolicy: f.get('policy') === 'typed' ? 'typed' : 'list' });
              (e.target as HTMLFormElement).reset();
              reload();
            } catch (x) {
              setErr(x);
            }
          }}
        >
          <h3>{t('app.newClass')}</h3>
          <Field label={t('app.className')}>
            <Input name="name" required maxLength={80} />
          </Field>
          <Field label={t('app.grade')}>
            <Input name="grade" maxLength={20} placeholder="P4" />
          </Field>
          <Field label={t('app.namePolicy')}>
            <Select name="policy" defaultValue="list">
              <option value="list">{t('app.namePolicy.list')}</option>
              <option value="typed">{t('app.namePolicy.typed')}</option>
            </Select>
          </Field>
          <Button type="submit" tone="primary">
            {t('app.create')}
          </Button>
        </form>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { t } = useLang();
  const { session, has, switchTenant } = useSession();
  return (
    <Guard>
      {session ? (
        <div className="r-stack" style={{ gap: 24 }}>
          <div className="r-row" style={{ justifyContent: 'space-between' }}>
            <h1>{t('app.hello', { name: session.user.name })}</h1>
            {session.tenants.length > 1 ? (
              <label className="r-field">
                <span>{t('app.tenant')}</span>
                <select className="r-select" value={session.tenant.id} onChange={(e) => void switchTenant(e.target.value)}>
                  {session.tenants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="r-muted">{session.tenant.name}</span>
            )}
          </div>
          <div className="toolbar">
            {has('school_admin') ? <Link className="r-btn" href="/app/school">{t('app.school')}</Link> : null}
            {has('publisher_admin') ? <Link className="r-btn" href="/app/publisher">{t('app.publisher')}</Link> : null}
            {session.roles.includes('platform_admin') ? <Link className="r-btn" href="/app/admin">{t('app.admin')}</Link> : null}
          </div>
          {has('teacher', 'school_admin') && session.tenant.kind === 'school' ? <Classes /> : null}
        </div>
      ) : null}
    </Guard>
  );
}
