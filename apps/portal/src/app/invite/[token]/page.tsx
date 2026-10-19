'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notice } from '@rihla/ui';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';

export default function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useLang();
  const { acceptInvite } = useSession();
  const router = useRouter();
  const [err, setErr] = useState('');
  return (
    <div className="r-stack" style={{ maxInlineSize: 440, marginInline: 'auto' }}>
      <h1>{t('invite.title')}</h1>
      <form
        className="r-card r-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const pw = String(new FormData(e.currentTarget).get('password'));
          try {
            await acceptInvite(token, pw);
            router.push('/app');
          } catch (x) {
            setErr((x as { code?: string }).code === 'weak-password' ? t('invite.password') : t('invite.error'));
          }
        }}
      >
        <Field label={t('invite.password')}>
          <Input name="password" type="password" minLength={10} autoComplete="new-password" required dir="ltr" />
        </Field>
        {err ? <Notice error>{err}</Notice> : null}
        <Button type="submit" tone="primary">
          {t('invite.submit')}
        </Button>
      </form>
    </div>
  );
}
