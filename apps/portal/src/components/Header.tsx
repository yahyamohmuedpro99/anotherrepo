'use client';
import Link from 'next/link';
import { useLang } from './LangProvider';
import { useSession } from './Session';

export function Header() {
  const { t, toggle } = useLang();
  const { session, logout } = useSession();
  return (
    <header>
      <a href="#main" className="skip">{t('nav.skip')}</a>
      <div className="r-band" />
      <nav className="r-wrap topnav" aria-label="main">
        <Link href="/" className="logo">
          {t('brand')}
        </Link>
        <div className="r-row">
          <Link href="/catalog">{t('nav.catalog')}</Link>
          {session ? (
            <>
              <Link href="/app">{t('nav.app')}</Link>
              <button type="button" className="linkish" onClick={() => void logout()}>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <Link href="/login">{t('nav.login')}</Link>
          )}
          <button type="button" className="r-btn" onClick={toggle} lang={t('nav.lang') === 'English' ? 'en' : 'ar'}>
            {t('nav.lang')}
          </button>
        </div>
      </nav>
    </header>
  );
}
