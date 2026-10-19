'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notice } from '@rihla/ui';
import { ApiError } from '@rihla/api-client';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';

export default function Login() {
  const { t } = useLang();
  const { login } = useSession();
  const router = useRouter();
  const [err, setErr] = useState<null | 'login.error' | 'login.unreachable'>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="r-stack" style={{ maxInlineSize: 440, marginInline: 'auto' }}>
      <h1>{t('login.title')}</h1>
      <form
        className="r-card r-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          try {
            await login(String(f.get('email')), String(f.get('password')));
            router.push('/app');
          } catch (e) {
            // only a 401 means the credentials are wrong; anything else is the server (e.g. a host waking up)
            setErr(e instanceof ApiError && e.status === 401 ? 'login.error' : 'login.unreachable');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('login.email')}>
          <Input name="email" type="email" autoComplete="username" required dir="ltr" />
        </Field>
        <Field label={t('login.password')}>
          <Input name="password" type="password" autoComplete="current-password" required dir="ltr" />
        </Field>
        {err ? <Notice error>{t(err)}</Notice> : null}
        <Button type="submit" tone="primary" disabled={busy}>
          {t('login.submit')}
        </Button>
      </form>
      <p className="r-muted">{t('login.students')}</p>
      <p className="r-muted">{t('login.sso')}</p>
    </div>
  );
}
