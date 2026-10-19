import type { Manifest } from '@rihla/pack-schema';
import type { EngineApi } from '../core/api.js';
import { passport } from '../core/storage.js';
import type { Bus } from '../core/audio.js';
import type { Hud } from './hud.js';
import { h } from './dom.js';
import { icon } from './icons.js';

type Entry = NonNullable<NonNullable<Manifest['collections']>['activities']>['entries'][number];

function pane(title: string, sub: string | null, close: () => void, closeLabel: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'pane card' },
    h('div', { class: 'band' }),
    h('div', { class: 'pbody' }, h('div', { class: 'ph' }, h('div', {}, h('h2', { text: title }), sub ? h('div', { class: 'psub', text: sub }) : null), h('button', { class: 'icon', type: 'button', 'aria-label': closeLabel, text: '×', onclick: close })), ...body),
  );
}

export function openPassport(e: EngineApi, hud: Hud, justStamped?: string): void {
  const m = e.manifest;
  let close = () => {};
  const grid = h('div', { class: 'stamps' });
  for (const s of m.stamps) {
    const got = e.state.stamps.has(s.id);
    const disc = h('div', { class: 'disc' }, h('b', { text: '✓' }));
    disc.style.background =
      s.style === 'galaxy' ? 'radial-gradient(circle at 50% 50%, #fff3c8 0, #9a8cff 30%, #2a2060 70%, #0a0820 100%)' : `radial-gradient(circle at 35% 30%, #fff9, ${s.color} 45%, #000a 100%)`;
    grid.append(h('div', { class: `stamp${got ? ' got' : ''}${justStamped === s.id ? ' thump' : ''}` }, disc, h('span', { text: e.t(s.title) }), h('small', { text: got ? e.t('engine.done') : e.t('engine.notYet') })));
  }
  const cert = m.certificate && e.check(m.certificate.when) ? h('div', { class: 'cert' }, h('h3', { text: e.t(m.certificate.title) }), h('p', { text: e.t(m.certificate.text, { name: e.state.name || e.t(m.intro.defaultName) }) })) : null;
  // stamps from other packs (the catalog-wide passport)
  const others = Object.entries(passport.all()).filter(([id]) => id !== m.id);
  const otherEl = others.length ? h('p', { class: 'pnote', text: others.map(([id, st]) => `${id}: ${st.length}`).join(' · ') }) : null;
  const notes = (m.intro.notes ?? []).map((k) => h('p', { class: 'pnote', text: e.t(k) }));
  close = hud.modal(pane(e.t('engine.passportTitle'), e.t('engine.stampsLine', { n: e.state.stamps.size, m: m.stamps.length }), () => close(), e.t('engine.close'), grid, cert, otherEl, ...notes));
}

function entryRow(e: EngineApi, en: Entry, after: () => void): HTMLElement {
  const done = e.check(en.done);
  const row = h('div', { class: `entry${done ? ' done' : ''}` });
  const ai = h('span', { class: 'ai', html: icon(en.icon ?? 'star') });
  if (en.icon === 'scarab') ai.firstElementChild?.classList.toggle('on', done);
  const sub = done && en.subDone ? e.text(en.subDone) : en.sub ? e.text(en.sub) : '';
  row.append(ai, h('div', { class: 'an' }, h('b', { text: e.text(en.title) }), sub ? h('small', { text: sub }) : null));
  const canGo = en.go && (!done || en.keepGo) && e.check(en.goWhen);
  if (canGo)
    row.append(
      h('button', {
        type: 'button',
        class: `btn sm${done ? '' : ' gold'}`,
        text: e.t(en.goLabel ?? 'engine.go'),
        onclick: () => {
          after();
          e.run(en.go);
        },
      }),
    );
  else if (done) row.append(h('span', { class: 'cnt', text: e.t('engine.done') }));
  return row;
}

export function openActivities(e: EngineApi, hud: Hud): void {
  const a = e.manifest.collections?.activities;
  if (!a) return;
  let close = () => {};
  const n = a.entries.filter((x) => e.check(x.done)).length;
  const list = h('div', {}, ...a.entries.map((en) => entryRow(e, en, () => close())));
  close = hud.modal(pane(e.t(a.title), e.t(a.sub, { n, m: a.entries.length }), () => close(), e.t('engine.close'), list, albumSection(e, hud)));
}

export function activityCount(e: EngineApi): string {
  const a = e.manifest.collections?.activities;
  if (!a) return '';
  return `${e.tr.num(a.entries.filter((x) => e.check(x.done)).length)}/${e.tr.num(a.entries.length)}`;
}

export function openLog(e: EngineApi, hud: Hud): void {
  const L = e.manifest.collections?.log;
  if (!L) return;
  let close = () => {};
  const body = h('div', {});
  for (const s of L.sections) {
    const head = h('div', { class: 'sec' }, h('span', { text: e.t(s.title) }));
    if (s.progress) head.append(h('span', { class: 'cnt', text: `${e.tr.num(e.state.count(s.progress.counter))}/${e.tr.num(s.progress.of)}` }));
    body.append(head);
    for (const en of s.entries) body.append(entryRow(e, en, () => close()));
  }
  close = hud.modal(pane(e.t(L.title), e.text(L.sub), () => close(), e.t('engine.close'), body));
}

export function logCount(e: EngineApi): number {
  const L = e.manifest.collections?.log;
  if (!L) return 0;
  return L.sections.reduce((n, s) => n + s.entries.filter((x) => e.check(x.done)).length, 0);
}

function albumSection(e: EngineApi, hud: Hud): HTMLElement {
  const al = e.state.album;
  const grid = h('div', { class: 'album' });
  if (!al.length) grid.append(h('p', { class: 'pnote', text: e.t(e.manifest.hud.album?.empty ?? 'engine.albumEmpty') }));
  for (const p of al.slice().reverse()) {
    grid.append(
      h('button', { type: 'button', class: 'thumb', onclick: () => openPhoto(e, hud, p.src, p.caption) }, h('img', { src: p.src, alt: p.caption })),
    );
  }
  return h('div', {}, h('div', { class: 'sec' }, h('span', { text: e.t('engine.album') }), h('span', { class: 'cnt', text: e.tr.num(al.length) })), grid, h('p', { class: 'pnote', text: e.t(e.manifest.hud.album?.note ?? 'engine.albumNote') }));
}

export function openAlbum(e: EngineApi, hud: Hud): void {
  let close = () => {};
  close = hud.modal(pane(e.t('engine.album'), null, () => close(), e.t('engine.close'), albumSection(e, hud)));
}

export function openPhoto(e: EngineApi, hud: Hud, src: string, caption: string): void {
  let close = () => {};
  const dl = h('a', { class: 'btn gold', href: src, download: `rihla-${Date.now()}.jpg`, html: icon('download') });
  dl.append(h('span', { text: e.t('engine.download') }));
  close = hud.modal(pane(e.t('engine.album'), null, () => close(), e.t('engine.close'), h('img', { src, alt: caption, style: 'display:block;max-width:100%;max-height:70vh;margin:0 auto;border-radius:12px' }), h('div', { class: 'qtitle', style: 'text-align:center;margin-top:8px', text: caption }), h('div', { class: 'mrow' }, dl)));
}

export interface SettingsHooks {
  setTextScale(s: number): void;
  textScale(): number;
  setReducedMotion(v: boolean): void;
  setQuality(q: 'auto' | 'low' | 'mid' | 'high'): void;
  quality(): 'auto' | 'low' | 'mid' | 'high';
}

export function openSettings(e: EngineApi, hud: Hud, s: SettingsHooks): void {
  let close = () => {};
  const size = h('div', { class: 'row' }, h('span', { text: e.t('engine.textSize'), style: 'flex:1' }));
  for (const [lbl, k] of [
    ['A−', 0.9],
    ['A', 1],
    ['A+', 1.15],
    ['A++', 1.3],
  ] as const)
    size.append(h('button', { type: 'button', class: `btn sm${Math.abs(s.textScale() - k) < 0.01 ? ' gold' : ''}`, text: lbl, 'aria-label': `${e.t('engine.textSize')} ${lbl}`, onclick: () => (s.setTextScale(k), close(), openSettings(e, hud, s)) }));
  const motion = h('input', { type: 'checkbox', id: 'r-motion' }) as HTMLInputElement;
  motion.checked = e.reducedMotion;
  motion.addEventListener('change', () => s.setReducedMotion(motion.checked));
  const vols = (['music', 'ambience', 'vo', 'sfx'] as Bus[]).map((b) => {
    const r = h('input', { type: 'range', min: '0', max: '1', step: '0.05', id: `r-vol-${b}` }) as HTMLInputElement;
    r.value = String(e.audio.getVolume(b));
    r.addEventListener('input', () => e.audio.setVolume(b, Number(r.value)));
    return h('div', { class: 'range' }, h('label', { for: `r-vol-${b}`, text: e.t(`engine.vol.${b}`) }), r);
  });
  const q = h('div', { class: 'row' }, h('span', { text: e.t('engine.quality'), style: 'flex:1' }));
  for (const k of ['auto', 'low', 'mid', 'high'] as const)
    q.append(h('button', { type: 'button', class: `btn sm${s.quality() === k ? ' gold' : ''}`, text: e.t(`engine.q.${k}`), onclick: () => (s.setQuality(k), close(), openSettings(e, hud, s)) }));
  const credits = h('button', { type: 'button', class: 'btn sm', text: e.t('engine.credits'), onclick: () => (close(), openCredits(e, hud)) });
  close = hud.modal(
    pane(
      e.t('engine.settingsTitle'),
      null,
      () => close(),
      e.t('engine.close'),
      size,
      h('div', { class: 'range' }, h('label', { for: 'r-motion', text: e.t('engine.reducedMotion') }), motion),
      h('div', { class: 'sec', text: e.t('engine.volume') }),
      ...vols,
      q,
      h('div', { class: 'mrow' }, credits),
    ),
  );
}

/** Auto-generated credits screen: pack credits plus every licensed asset (BRIEF §14). */
export function openCredits(e: EngineApi, hud: Hud): void {
  let close = () => {};
  const list = h('div', {});
  for (const c of e.manifest.credits) list.append(h('div', { class: 'entry' }, h('span'), h('div', { class: 'an' }, h('b', { text: c.name }), h('small', { text: e.t(c.role) })), h('span')));
  for (const a of e.pack.licenses?.assets ?? []) list.append(h('div', { class: 'entry' }, h('span'), h('div', { class: 'an' }, h('b', { text: a.title }), h('small', { text: `${a.attribution} · ${a.licence}` })), h('span')));
  for (const c of Object.values(e.pack.cards)) if (c.media) list.append(h('div', { class: 'entry' }, h('span'), h('div', { class: 'an' }, h('b', { text: e.t(c.media.title) }), h('small', { text: `${c.media.attribution} · ${c.media.licence}` })), h('span')));
  close = hud.modal(pane(e.t('engine.credits'), null, () => close(), e.t('engine.close'), list));
}
