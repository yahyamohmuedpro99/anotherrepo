import { RULES } from '@rihla/pack-schema/full';
import { useStudio } from '../lib/store';

/** The same checks as `rihla-pack check`, as a checklist; clicking a finding opens the file (BRIEF §8). */
export function Validation({ goTo }: { goTo: () => void }) {
  const { report, revalidate, select, t, files } = useStudio();
  if (!report) return null;
  const all = [...report.errors, ...report.warnings];
  const open = (file: string, path?: string) => {
    const m = /^\/entities\/(\d+)/.exec(path ?? '');
    if (file in files) {
      select({ path: file, ...(m && file.startsWith('scenes/') ? { entity: Number(m[1]) } : {}) });
      goTo();
    }
  };
  return (
    <div className="r-stack">
      <div className="r-row">
        <button type="button" className="r-btn primary" onClick={() => void revalidate()}>↻</button>
        <b className={report.errors.length ? 'bad' : 'good'}>{report.errors.length ? t('errors', { n: report.errors.length }) : t('allGood')}</b>
        <span className="r-muted">{t('warnings', { n: report.warnings.length })}</span>
      </div>
      <ul className="checklist">
        {Object.entries(RULES).map(([rule, label]) => {
          const n = all.filter((f) => f.rule === rule);
          const err = n.some((f) => f.severity === 'error');
          return (
            <li key={rule} className={err ? 'bad' : n.length ? 'warn' : 'good'}>
              <span aria-hidden="true">{err ? '✘' : n.length ? '!' : '✔'}</span> {label}
              {n.length ? (
                <ul>
                  {n.slice(0, 30).map((f, i) => (
                    <li key={i}>
                      <button type="button" className="linkish" onClick={() => open(f.file, f.path)} dir="ltr">
                        {f.file}{f.path ? ` ${f.path}` : ''}: {f.message}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <details>
        <summary>scenes</summary>
        <pre dir="ltr">{JSON.stringify(report.stats.scenes, null, 1)}</pre>
      </details>
    </div>
  );
}
