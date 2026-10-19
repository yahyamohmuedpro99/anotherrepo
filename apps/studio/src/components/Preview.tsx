import { useEffect, useRef, useState } from 'react';
import { mount, type RihlaHandle } from '@rihla/engine';
import { useStudio } from '../lib/store';

const DEVICES = { phone: [390, 844], tablet: [820, 1180], laptop: [1280, 800] } as const;
type Device = keyof typeof DEVICES;

/** The real engine, at any tier, inside a device frame; clicks in the world feed click-to-place (BRIEF §8). */
export function Preview() {
  const { t, packId, files, previewNonce, bumpPreview, selection, set, pack, dirty, save } = useStudio();
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<RihlaHandle | null>(null);
  const [tier, setTier] = useState<'auto' | 'low' | 'mid' | 'high'>('mid');
  const [device, setDevice] = useState<Device>('laptop');
  const [poi, setPoi] = useState('');
  const [picked, setPicked] = useState<{ x: number; y: number; z: number; entity?: string } | null>(null);
  const [lang, setLang] = useState('ar-EG');

  useEffect(() => {
    if (!packId || !host.current) return;
    host.current.innerHTML = '';
    const h = mount(host.current, { packUrl: `/studio-api/packs/${packId}/raw/`, mode: 'preview', quality: tier, locale: lang, skipIntro: true, ...(poi ? { startPoi: poi } : {}), onPick: (p) => setPicked(p) });
    handle.current = h;
    return () => {
      h.destroy();
      handle.current = null;
    };
  }, [packId, previewNonce, tier, poi, lang]);

  const [w, hgt] = DEVICES[device];
  const scale = device === 'laptop' ? 0.75 : device === 'tablet' ? 0.55 : 0.75;
  const sel = selection;
  const selPoi = sel?.path.startsWith('pois/') ? (files[sel.path] as { id: string; scene: string; at: number[]; spawn?: { at?: number[] } }) : null;
  const selScene = sel?.path.startsWith('scenes/') && sel.entity !== undefined ? (files[sel.path] as { entities: { id: string; at?: number[] }[] }) : null;
  const selEntity = selScene ? selScene.entities[sel!.entity!] : null;

  return (
    <div className="preview">
      <div className="r-row toolbar">
        <label className="r-field">
          <span>{t('tier')}</span>
          <select className="r-select" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
            {['auto', 'low', 'mid', 'high'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="r-field">
          <span>{t('device')}</span>
          <select className="r-select" value={device} onChange={(e) => setDevice(e.target.value as Device)}>
            {(Object.keys(DEVICES) as Device[]).map((d) => <option key={d} value={d}>{t(d)}</option>)}
          </select>
        </label>
        <label className="r-field">
          <span>{t('startAt')}</span>
          <select className="r-select" value={poi} onChange={(e) => setPoi(e.target.value)}>
            <option value="">—</option>
            {Object.keys(pack?.pois ?? {}).map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="r-field">
          <span>locale</span>
          <select className="r-select" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option>ar-EG</option>
            <option>en</option>
          </select>
        </label>
        <button type="button" className="r-btn primary" onClick={() => (dirty.size ? void save() : bumpPreview())}>
          {t('reload')}
        </button>
      </div>
      <div className="frame-wrap">
        <div className={`frame ${device}`} style={{ width: w, height: hgt, transform: `scale(${scale})` }}>
          <div ref={host} style={{ position: 'absolute', inset: 0 }} />
        </div>
      </div>
      <div className="r-card place">
        <p className="r-muted">{t('clickHint')}</p>
        {picked ? (
          <div className="r-row">
            <code dir="ltr">{t('picked', picked)}</code>
            {picked.entity ? <code dir="ltr">{t('pickedEntity', { id: picked.entity })}</code> : null}
            {selPoi ? (
              <button type="button" className="r-btn gold" onClick={() => set(sel!.path, { ...selPoi, at: [picked.x, picked.z], spawn: { ...(selPoi.spawn ?? {}), at: [picked.x, picked.z] } })}>
                {t('placePoi', { id: selPoi.id })}
              </button>
            ) : null}
            {selEntity ? (
              <button
                type="button"
                className="r-btn gold"
                onClick={() => {
                  const ents = [...selScene!.entities];
                  ents[sel!.entity!] = { ...selEntity, at: selEntity.at?.length === 3 ? [picked.x, selEntity.at[1]!, picked.z] : [picked.x, picked.z] };
                  set(sel!.path, { ...selScene, entities: ents });
                }}
              >
                {t('placeEntity', { id: selEntity.id })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
