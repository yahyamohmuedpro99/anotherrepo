import { useMemo, useState } from 'react';
import { localePath, useStudio } from '../lib/store';

/** Every string, Arabic and English side by side; missing translations highlighted (BRIEF §8, §15). */
export function Translations() {
  const { files, set, locales, t } = useStudio();
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const tables = locales.map((l) => (files[localePath(l)] ?? {}) as Record<string, string>);
  const keys = useMemo(() => [...new Set(tables.flatMap((x) => Object.keys(x)))].sort(), [tables]);
  const rows = keys.filter((k) => (!missing || tables.some((tb) => !tb[k])) && (!q || k.includes(q) || tables.some((tb) => (tb[k] ?? '').includes(q))));
  return (
    <div className="r-stack">
      <div className="r-row">
        <input className="r-input" style={{ maxInlineSize: 320 }} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="r-row"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> {t('onlyMissing')}</label>
        <span className="r-muted">{t('keys', { n: rows.length })}</span>
      </div>
      <div className="r-table-wrap">
        <table className="r-table tr-table">
          <thead>
            <tr>
              <th>key</th>
              {locales.map((l) => <th key={l}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((k) => (
              <tr key={k}>
                <td><code dir="ltr">{k}</code></td>
                {locales.map((l, i) => (
                  <td key={l} className={!tables[i]![k] ? 'missing' : ''}>
                    <textarea className="r-textarea" rows={Math.min(5, Math.max(1, Math.ceil((tables[i]![k] ?? '').length / 60)))} dir={l.startsWith('ar') ? 'rtl' : 'ltr'} lang={l} value={tables[i]![k] ?? ''} onChange={(e) => set(localePath(l), { ...tables[i], [k]: e.target.value })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
