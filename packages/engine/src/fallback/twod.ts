import type { EngineApi } from '../core/api.js';
import { renderItem } from '../ui/dialog.js';
import { h } from '../ui/dom.js';
import type { Hud } from '../ui/hud.js';
import { openPassport } from '../ui/panels.js';

/**
 * Cards-and-questions mode for devices that cannot run WebGL (or are below the low tier). Walks through the
 * pack's POIs in order: read the evidence card, answer the POI's questions, earn the stamps — the same
 * learning events as the 3D trip, so teacher reports still work (BRIEF §7 landing behaviour).
 */
export function renderTwoD(e: EngineApi, hud: Hud, onExit: () => void): void {
  hud.showHud(true);
  const wrap = h('div', { class: 'twod' });
  hud.root.append(wrap);
  const pois = Object.values(e.pack.pois);
  let i = 0;
  const allItems = new Set(pois.flatMap((p) => p.items ?? []));
  const header = h('section', { class: 'pane card' }, h('div', { class: 'band' }), h('div', { class: 'pbody' }, h('div', { class: 'kicker', text: e.t('engine.twoD') }), h('h2', { class: 'qtitle', text: e.t(e.manifest.title) }), h('p', { class: 'story', text: e.t('engine.twoDIntro') })));
  wrap.append(header, hud.dialog.el);
  hud.dialog.el.style.margin = '0 auto';
  const next = () => {
    if (i >= pois.length) {
      for (const s of e.manifest.stamps) if (!e.state.stamps.has(s.id) && pois.length && e.manifest.stamps.length === 1) e.run([{ do: 'give.stamp', stamp: s.id }]);
      e.emit('completed', { type: 'pack', id: e.manifest.id });
      hud.dialog.open([{ who: e.t(e.manifest.title), glyph: '✓', text: e.t('engine.twoDDone') }], { onEnd: () => openPassport(e, hud) });
      return;
    }
    const poi = pois[i++]!;
    e.emit('visited-poi', { type: 'poi', id: poi.id }, undefined, { objectives: poi.objectives });
    const card = poi.card ? e.pack.cards[poi.card] : undefined;
    const items = (poi.items ?? []).map((id) => e.pack.items[id]).filter((x): x is NonNullable<typeof x> => !!x);
    const askAll = (k: number) => {
      if (k >= items.length) {
        next();
        return;
      }
      const it = items[k]!;
      renderItem(hud.dialog, it, e.t('engine.quizTitle'), {
        t: (key, p) => e.t(key, p),
        num: (n) => e.tr.num(n),
        hints: e.hints,
        onAttempt: (correct, attempt, response) => e.emit('answered', { type: 'item', id: it.id }, { correct, attempt, response }, { objectives: it.objectives }),
        onHint: () => e.emit('hint-used', { type: 'item', id: it.id }, undefined, { objectives: it.objectives }),
        onCorrect: () => askAll(k + 1),
        toast: (t) => hud.toast(t),
        sfx: (s) => e.audio.sfx(s),
      });
    };
    if (card) {
      e.emit('viewed-card', { type: 'card', id: card.id }, undefined, { objectives: card.objectives ?? [] });
      hud.dialog.open([{ who: e.t(poi.title), glyph: '!', text: e.t(card.body) }], { onEnd: () => askAll(0) });
    } else hud.dialog.open([{ who: e.t(poi.title), glyph: '!', text: e.t(poi.title) }], { onEnd: () => askAll(0) });
  };
  void allItems;
  void onExit;
  next();
}
