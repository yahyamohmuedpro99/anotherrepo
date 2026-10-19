import { useEffect, useState } from 'react';
import { api, useStudio } from './lib/store';
import { Preview } from './components/Preview';
import { Content } from './components/Content';
import { Translations } from './components/Translations';
import { Validation } from './components/Validation';
import { Media } from './components/Media';
import { Publish } from './components/Publish';
import { Revisions } from './components/Revisions';
import { RawJson } from './components/RawJson';
import type { SKey } from './lib/strings';

const TABS: SKey[] = ['preview', 'content', 'translations', 'validation', 'media', 'publish', 'revisions', 'json'];

export function App() {
  const { t, lang, setLang, packId, open, dirty, save, report } = useStudio();
  const [packs, setPacks] = useState<string[]>([]);
  const [tab, setTab] = useState<SKey>('content');
  useEffect(() => {
    void api<{ packs: string[] }>('/packs').then((r) => {
      setPacks(r.packs);
      const want = new URLSearchParams(location.search).get('pack') ?? r.packs[0];
      if (want) void open(want);
    });
  }, [open]);
  useEffect(() => {
    document.documentElement.lang = lang === 'ar' ? 'ar-EG' : 'en';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  return (
    <div className="studio">
      <div className="r-band" />
      <header className="bar">
        <b className="logo">{t('title')}</b>
        <label className="r-row">
          <span>{t('pack')}</span>
          <select className="r-select" value={packId ?? ''} onChange={(e) => void open(e.target.value)}>
            {packs.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        {report ? <span className={report.errors.length ? 'bad' : 'good'}>{report.errors.length ? t('errors', { n: report.errors.length }) : '✔'}</span> : null}
        <span className="grow" />
        {dirty.size ? <span className="r-muted">{t('unsaved', { n: dirty.size })}</span> : null}
        <button type="button" className="r-btn primary" disabled={!dirty.size} onClick={() => void save()}>{t('saveAll')}</button>
        <button type="button" className="r-btn" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('lang')}</button>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>
        ))}
      </nav>
      <main className="panel" role="tabpanel">
        {!packId ? null : tab === 'preview' ? <Preview /> : tab === 'content' ? <Content /> : tab === 'translations' ? <Translations /> : tab === 'validation' ? <Validation goTo={() => setTab('content')} /> : tab === 'media' ? <Media /> : tab === 'publish' ? <Publish /> : tab === 'revisions' ? <Revisions /> : <RawJson />}
      </main>
    </div>
  );
}
