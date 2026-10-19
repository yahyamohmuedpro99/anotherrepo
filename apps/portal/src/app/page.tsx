import Link from 'next/link';
import { getLang } from '@/lib/lang';
import { t } from '@/lib/strings';

export default async function Home() {
  const lang = await getLang();
  return (
    <div className="r-stack" style={{ gap: 24 }}>
      <section className="hero">
        <h1>{t(lang, 'home.title')}</h1>
        <p>{t(lang, 'home.lead')}</p>
        <Link className="r-btn gold big" href="/catalog">
          {t(lang, 'home.cta')}
        </Link>
      </section>
      <div className="r-grid">
        {(['teachers', 'schools', 'publishers'] as const).map((k) => (
          <section key={k} className="r-card">
            <h2>{t(lang, `home.${k}`)}</h2>
            <p>{t(lang, `home.${k}.text`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
