import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { getLang } from '@/lib/lang';
import { t } from '@/lib/strings';
import { LangProvider } from '@/components/LangProvider';
import { SessionProvider } from '@/components/Session';
import { Header } from '@/components/Header';

export const metadata: Metadata = { title: { default: 'رحلة · Rihla', template: '%s · رحلة' }, description: 'رحلات تلاتية الأبعاد قصيرة مربوطة بالدرس · Short 3D trips tied to the lesson' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f3f8f' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang === 'ar' ? 'ar-EG' : 'en'} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <LangProvider lang={lang}>
          <SessionProvider>
            <Header />
            <main id="main" className="r-wrap">
              {children}
            </main>
            <footer>
              <div className="r-wrap r-row" style={{ justifyContent: 'space-between' }}>
                <span>{t(lang, 'footer.note')}</span>
                <a href="/privacy">{t(lang, 'nav.privacy')}</a>
              </div>
            </footer>
          </SessionProvider>
        </LangProvider>
      </body>
    </html>
  );
}
