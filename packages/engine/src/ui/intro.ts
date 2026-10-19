import type { EngineApi } from '../core/api.js';
import { cleanText } from '../math/noise.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export interface IntroResult {
  name: string;
  color: number;
}

/** The pack's title card: story, features, name and colour, start. */
export function buildIntro(e: EngineApi, onStart: (r: IntroResult) => void, onLang: () => void, hasProgress: boolean): HTMLElement {
  const m = e.manifest, I = m.intro;
  const name = h('input', { class: 'r-text', id: 'r-name', maxlength: '16', autocomplete: 'nickname', dir: 'auto', placeholder: e.t(I.namePlaceholder ?? 'engine.namePh') }) as HTMLInputElement;
  name.value = e.state.name;
  const sw = h('div', { class: 'swatches' });
  (I.palette?.colors ?? []).forEach((c, i) => {
    const inp = h('input', { type: 'radio', name: 'r-robe', value: String(i), 'aria-label': e.t(I.palette!.names[i] ?? '') }) as HTMLInputElement;
    inp.checked = i === e.state.color;
    const sp = h('span');
    sp.style.background = c;
    sw.append(h('label', { class: 'sw', title: e.t(I.palette!.names[i] ?? '') }, inp, sp));
  });
  const form = h('form', { class: 'sform', autocomplete: 'off' });
  if (I.askName) form.append(h('div', {}, h('label', { class: 'flabel', for: 'r-name', text: e.t(I.nameLabel ?? 'engine.namePh') }), name));
  if (I.palette) form.append(h('fieldset', {}, h('legend', { class: 'flabel', text: e.t(I.palette.label) }), sw));
  form.append(h('button', { class: 'btn gold big', type: 'submit', text: hasProgress ? `${e.t(I.start)}` : e.t(I.start) }));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const sel = form.querySelector<HTMLInputElement>('input[name="r-robe"]:checked');
    onStart({ name: cleanText(name.value) || e.t(I.defaultName), color: sel ? Number(sel.value) : e.state.color });
  });
  const feats = (I.features ?? []).map((f) => h('span', { html: icon(f.icon) }, h('span', { text: e.t(f.text) })));
  const controls = I.controls ? h('p', { class: 'controls', text: e.t(e.isTouch ? I.controls.touch : I.controls.desk) }) : null;
  return h(
    'div',
    { class: 'intro' },
    h(
      'section',
      { class: 'icard card' },
      h('div', { class: 'band' }),
      h(
        'div',
        { class: 'ibody' },
        h('div', { class: 'irow' }, h('div', { class: 'kicker', text: m.kicker ? e.t(m.kicker) : '' }), h('button', { class: 'lang', type: 'button', text: e.t('engine.lang'), onclick: onLang })),
        h('h1', { class: 'ititle', text: e.t(m.title) }),
        m.altTitle ? h('div', { class: 'ialt', text: e.t(m.altTitle) }) : null,
        h('div', { class: 'orn', 'aria-hidden': 'true' }, h('span'), h('i'), h('span')),
        ...I.story.map((k) => h('p', { class: 'story', text: e.t(k) })),
        feats.length ? h('div', { class: 'news' }, ...feats) : null,
        form,
        controls,
        ...(I.notes ?? []).map((k) => h('p', { class: 'controls', text: e.t(k) })),
      ),
    ),
  );
}

/** QR deep links skip the menu: a short title card, then straight into play (BRIEF §2 flow A). */
export function buildSplash(e: EngineApi, poiTitle: string | null, onGo: () => void, seconds = 3): HTMLElement {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    el.remove();
    onGo();
  };
  const el = h(
    'div',
    { class: 'intro', onclick: go },
    h(
      'section',
      { class: 'icard card' },
      h('div', { class: 'band' }),
      h(
        'div',
        { class: 'ibody', style: 'text-align:center' },
        h('div', { class: 'kicker', text: e.manifest.kicker ? e.t(e.manifest.kicker) : '' }),
        h('h1', { class: 'ititle', text: e.t(e.manifest.title) }),
        poiTitle ? h('div', { class: 'ialt', text: poiTitle }) : null,
        h('p', { class: 'controls', text: e.t('engine.splashTap') }),
      ),
    ),
  );
  setTimeout(go, seconds * 1000);
  return el;
}

export function buildLoading(text: string): { el: HTMLElement; set: (pct: number, label: string) => void } {
  const bar = h('i');
  const label = h('div', { class: 'qtitle', text });
  const el = h('div', { class: 'loading', role: 'status' }, h('div', { class: 'card' }, label, h('div', { class: 'bar' }, bar)));
  return {
    el,
    set(pct, l) {
      bar.style.width = `${Math.round(pct * 100)}%`;
      label.textContent = l;
    },
  };
}
