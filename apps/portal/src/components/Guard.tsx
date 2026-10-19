'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Notice } from '@rihla/ui';
import { useLang } from './LangProvider';
import { useSession } from './Session';

/** Shows children once signed in (optionally with a role); otherwise a sign-in prompt. */
export function Guard({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { t } = useLang();
  const { session, ready, has } = useSession();
  if (!ready) return <p className="r-muted">{t('app.loading')}</p>;
  if (!session)
    return (
      <Notice>
        {t('app.signin')} <Link href="/login">{t('nav.login')}</Link>
      </Notice>
    );
  if (roles && !has(...roles)) return <Notice error>403</Notice>;
  return <>{children}</>;
}

export function ErrorLine({ error }: { error: unknown }) {
  const { t } = useLang();
  if (!error) return null;
  return <Notice error>{t('common.error', { msg: error instanceof Error ? error.message : String(error) })}</Notice>;
}
