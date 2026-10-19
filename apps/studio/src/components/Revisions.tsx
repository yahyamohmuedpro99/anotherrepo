import { useEffect, useState } from 'react';
import { api, useStudio } from '../lib/store';

interface Rev { hash: string; date: string; author: string; subject: string }

/** Every saved revision is a git commit; published versions are immutable in the API (BRIEF §8). */
export function Revisions() {
  const { packId, t, dirty, save } = useStudio();
  const [revs, setRevs] = useState<Rev[]>([]);
  const [diff, setDiff] = useState('');
  const [author, setAuthor] = useState(() => localStorage.getItem('studio.author') ?? '');
  const load = () => {
    if (packId) void api<{ revisions: Rev[] }>(`/packs/${packId}/revisions`).then((r) => setRevs(r.revisions));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [packId]);
  return (
    <div className="r-stack">
      <form
        className="r-card r-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const msg = String(new FormData(e.currentTarget).get('msg'));
          if (dirty.size) await save();
          localStorage.setItem('studio.author', author);
          await api(`/packs/${packId}/revision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: msg, author }) });
          (e.target as HTMLFormElement).reset();
          load();
        }}
      >
        <input className="r-input" style={{ maxInlineSize: 200 }} placeholder={t('author2')} value={author} onChange={(e) => setAuthor(e.target.value)} />
        <input className="r-input" name="msg" required placeholder={t('revisionMsg')} style={{ flex: 1 }} />
        <button type="submit" className="r-btn primary">{t('makeRevision')}</button>
      </form>
      <table className="r-table">
        <tbody>
          {revs.map((r, i) => (
            <tr key={r.hash}>
              <td dir="ltr"><code>{r.hash}</code></td>
              <td>{r.date}</td>
              <td>{r.author}</td>
              <td>{r.subject}</td>
              <td>
                <button type="button" className="r-btn" onClick={() => void api<string>(`/packs/${packId}/diff?from=${revs[i + 1]?.hash ?? r.hash}&to=${r.hash}`).then(setDiff)}>{t('diff')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {diff ? <pre className="diff" dir="ltr">{diff}</pre> : null}
    </div>
  );
}
