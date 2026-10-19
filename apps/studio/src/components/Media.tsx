import { useState } from 'react';
import { api, useStudio } from '../lib/store';

const FIELDS = ['title', 'sourceUrl', 'author', 'licence', 'licenceUrl', 'attribution'] as const;

/** Uploads require the full licence record before the file can be used (BRIEF §14). */
export function Media() {
  const { packId, media, files, open, t } = useStudio();
  const [msg, setMsg] = useState('');
  const lic = ((files['LICENSES.json'] as { assets?: Record<string, string>[] } | undefined)?.assets ?? []);
  return (
    <div className="r-stack">
      <p className="r-notice">{t('licenceNeeded')}</p>
      <form
        className="r-card r-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const file = f.get('file') as File | null;
          if (!file || !packId) return;
          const meta = Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) ?? '')]));
          const path = String(f.get('path') || `media/${file.name}`);
          try {
            await api(`/packs/${packId}/media?path=${encodeURIComponent(path)}&meta=${encodeURIComponent(JSON.stringify(meta))}`, { method: 'POST', body: file });
            setMsg('✔ ' + path);
            await open(packId);
          } catch (x) {
            setMsg('✘ ' + String((x as Error).message));
          }
        }}
      >
        <label className="r-field"><span>{t('file')}</span><input type="file" name="file" required accept="image/*,audio/*,.glb,.gltf,.ktx2" /></label>
        <label className="r-field"><span>{t('pathInPack')}</span><input className="r-input" name="path" placeholder="media/photo.webp" dir="ltr" /></label>
        {FIELDS.map((k) => (
          <label key={k} className="r-field"><span>{t(k === 'title' ? 'file' : k)}</span><input className="r-input" name={k} required dir={k === 'title' || k === 'attribution' ? 'auto' : 'ltr'} /></label>
        ))}
        <button type="submit" className="r-btn primary">{t('upload')}</button>
        {msg ? <p>{msg}</p> : null}
      </form>
      <table className="r-table">
        <thead><tr><th>{t('pathInPack')}</th><th>{t('licence')}</th><th>{t('author')}</th></tr></thead>
        <tbody>
          {media.map((m) => {
            const l = lic.find((x) => x.path === m);
            return <tr key={m} className={l ? '' : 'missing'}><td dir="ltr">{m}</td><td>{l?.licence ?? '✘'}</td><td>{l?.author ?? ''}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
