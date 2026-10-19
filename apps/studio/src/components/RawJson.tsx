import { useState } from 'react';
import { useStudio } from '../lib/store';

/** Raw JSON for engineers only (authors use the forms). */
export function RawJson() {
  const { files, set, t } = useStudio();
  const paths = Object.keys(files).filter((p) => p.endsWith('.json')).sort();
  const [path, setPath] = useState(paths[0] ?? '');
  const [text, setText] = useState('');
  const [bad, setBad] = useState('');
  const pick = (p: string) => {
    setPath(p);
    setText(JSON.stringify(files[p], null, 1));
    setBad('');
  };
  return (
    <div className="r-stack">
      <p className="r-notice">{t('rawWarn')}</p>
      <select className="r-select" value={path} onChange={(e) => pick(e.target.value)} dir="ltr">
        {paths.map((p) => <option key={p}>{p}</option>)}
      </select>
      <textarea
        className="r-textarea mono"
        dir="ltr"
        style={{ minBlockSize: 480 }}
        value={text || JSON.stringify(files[path], null, 1)}
        onChange={(e) => {
          setText(e.target.value);
          try {
            set(path, JSON.parse(e.target.value));
            setBad('');
          } catch (x) {
            setBad(String((x as Error).message));
          }
        }}
      />
      {bad ? <p className="bad">{bad}</p> : null}
    </div>
  );
}
