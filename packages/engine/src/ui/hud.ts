import { CSS } from './styles.js';
import { DialogBox } from './dialog.js';
import { h, clear, setRich } from './dom.js';
import { SCARAB_SVG, icon } from './icons.js';
import { Labels } from './labels.js';

export interface QuestView {
  title: string;
  kicker?: string;
  goal: string;
  progress?: { n: number; of: number; style: 'scarab' | 'dots' | 'diamonds' };
  buttons: { label: string; icon?: string; style?: string; fn: () => void }[];
}
export interface InfoView {
  kicker: string;
  title: string;
  rows: [string, string][];
  note?: string;
  progress: { label: string; n: number; of: number; style: 'dots' | 'diamonds' }[];
  buttons: { label: string; icon?: string; style?: string; fn: () => void }[];
}
export interface ActionView {
  id: string;
  icon: string;
  label: string;
  fn: () => void;
}
export interface ContextView {
  id: string;
  kicker: string;
  title: string;
  sub: string;
  swatch?: string;
  label: string;
  fn: () => void;
}
export interface ButtonDef {
  id: string;
  label: string;
  icon?: string;
  hold?: 'up' | 'down' | 'boost' | 'jump';
  fn?: () => void;
  round?: boolean;
  visible: boolean;
}

/** All HUD DOM. Pure view: the engine decides what to show and passes callbacks. */
export class Hud {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly labels = new Labels();
  readonly dialog: DialogBox;
  readonly hud: HTMLElement;
  readonly mini: HTMLCanvasElement;
  readonly joy: HTMLElement;
  readonly knob: HTMLElement;
  private quest: HTMLElement;
  private info: HTMLElement;
  private veh: HTMLElement;
  private topRow: HTMLElement;
  private toasts: HTMLElement;
  private hint: HTMLElement;
  private place: HTMLElement;
  private placeA: HTMLElement;
  private placeB: HTMLElement;
  private ctxCard: HTMLElement;
  private travel: HTMLElement;
  private btnRow: HTMLElement;
  private actBtn: HTMLButtonElement;
  readonly mapWrap: HTMLElement;
  readonly north: HTMLElement;
  readonly fade: HTMLElement;
  readonly flash: HTMLElement;
  readonly frame: HTMLElement;
  readonly warp: HTMLCanvasElement;
  readonly modalLayer: HTMLElement;
  private teacherEl: HTMLElement;
  readonly perf: HTMLElement;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  private curAction: ActionView | null = null;
  private curCtx: ContextView | null = null;
  private buttonsKey = '';
  private buttonEls = new Map<string, HTMLButtonElement>();
  onHold: (k: 'up' | 'down' | 'boost', on: boolean) => void = () => {};

  constructor(host: HTMLElement, themeVars: string, labels: { next: () => string; close: () => string }) {
    if (!document.getElementById('rihla-css')) document.head.append(h('style', { id: 'rihla-css', text: CSS }));
    this.canvas = h('canvas', { class: 'r-scene', tabindex: '0' });
    this.dialog = new DialogBox(labels);
    this.quest = h('section', { class: 'qcard card', hidden: true, 'aria-live': 'polite' });
    this.info = h('section', { class: 'qcard card', hidden: true });
    this.veh = h('section', { class: 'qcard card', hidden: true, 'aria-live': 'polite' });
    this.topRow = h('div', { class: 'row' });
    this.mini = h('canvas', { class: 'r-mini', tabindex: '0', role: 'button' });
    this.north = h('div', { class: 'north' });
    this.mapWrap = h('div', { class: 'mapwrap', hidden: true }, this.mini, this.north);
    this.placeA = h('div', { class: 'placeA' });
    this.placeB = h('div', { class: 'placeB' });
    this.place = h('div', { class: 'place' }, this.placeA, this.placeB);
    this.toasts = h('div', { class: 'toasts' });
    this.hint = h('div', { class: 'hint card', hidden: true });
    this.ctxCard = h('section', { class: 'ocard card', hidden: true });
    this.travel = h('div', { class: 'travelbar', hidden: true });
    this.knob = h('div', { class: 'knob' });
    this.joy = h('div', { class: 'joy', hidden: true }, this.knob);
    this.actBtn = h('button', { class: 'btn gold act', type: 'button', hidden: true, onclick: () => this.curAction?.fn() });
    this.btnRow = h('div', { class: 'row br' });
    this.hud = h(
      'div',
      { class: 'r-hud', hidden: true },
      h('div', { class: 'top' }, h('div', { class: 'side' }, this.quest, this.info, this.veh, this.topRow), this.mapWrap),
      h('div', { class: 'mid' }, this.place, this.toasts, this.hint, this.ctxCard, this.dialog.el),
      this.travel,
      h('div', { class: 'bottom', dir: 'ltr' }, this.joy, this.btnRow),
    );
    this.btnRow.append(this.actBtn);
    this.fade = h('div', { class: 'fade' });
    this.flash = h('div', { class: 'flash' });
    this.frame = h('div', { class: 'frame', hidden: true });
    this.warp = h('canvas', { class: 'warp', hidden: true });
    this.modalLayer = h('div');
    this.teacherEl = h('div', { class: 'teacher', hidden: true }, h('div', { class: 'card' }));
    this.perf = h('div', { class: 'perf', hidden: true });
    this.root = h('div', { class: 'rihla', style: themeVars }, this.canvas, h('div', { class: 'r-vignette' }), this.labels.layer, this.hud, this.frame, this.modalLayer, this.fade, this.flash, this.warp, this.teacherEl, this.perf);
    host.append(this.root);
  }

  setLocale(lang: string, dir: 'rtl' | 'ltr'): void {
    this.root.lang = lang;
    this.root.dir = dir;
    this.root.classList.toggle('en', dir === 'ltr');
  }

  showHud(on: boolean): void {
    this.hud.hidden = !on;
  }

  /* ---------------------------------------------------------------- toasts, hint, banner */

  toast(text: string, o: { kind?: string; ms?: number; onClick?: () => void } = {}): void {
    const el = h(o.onClick ? 'button' : 'div', { class: `toast ${o.kind ?? ''}`, text, dir: 'auto', role: 'status' });
    if (o.onClick) {
      (el as HTMLButtonElement).type = 'button';
      el.addEventListener('click', () => {
        o.onClick!();
        el.remove();
      });
    }
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, o.ms ?? 4200);
  }

  setHint(rich: string, show: boolean, seconds = 16): void {
    setRich(this.hint, rich);
    if (show && !this.dialog.isOpen) {
      this.hint.hidden = false;
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => (this.hint.hidden = true), seconds * 1000);
    }
  }
  hideHint(): void {
    this.hint.hidden = true;
  }
  toggleHint(): void {
    this.hint.hidden = !this.hint.hidden;
  }

  banner(a: string, b: string, langA: string, langB: string): void {
    this.placeA.textContent = a;
    this.placeA.lang = langA;
    this.placeB.textContent = b;
    this.placeB.lang = langB;
    this.placeB.dir = langB.startsWith('ar') ? 'rtl' : 'ltr';
    this.place.classList.add('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.place.classList.remove('on'), 3400);
  }

  /* ---------------------------------------------------------------- cards */

  private progressEl(p: { n: number; of: number; style: string }): HTMLElement {
    if (p.style === 'scarab') {
      const box = h('div', { class: 'scarabs', role: 'img', 'aria-label': `${p.n}/${p.of}` });
      box.innerHTML = SCARAB_SVG.repeat(p.of);
      [...box.children].forEach((c, i) => c.classList.toggle('on', i < p.n));
      return box;
    }
    const d = h('span', { class: `dots ${p.style === 'diamonds' ? 'diamonds' : ''}`, role: 'img', 'aria-label': `${p.n}/${p.of}` });
    for (let i = 0; i < p.of; i++) d.append(h('i', { class: i < p.n ? 'on' : '' }));
    return d;
  }

  private buttonsEl(btns: { label: string; icon?: string; style?: string; fn: () => void }[]): HTMLElement | null {
    if (!btns.length) return null;
    const row = h('div', { class: 'cta' });
    for (const b of btns) {
      const el = h('button', { type: 'button', class: `btn sm ${b.style ?? 'gold'}`, onclick: () => b.fn() });
      el.innerHTML = icon(b.icon);
      el.append(h('span', { text: b.label }));
      row.append(el);
    }
    return row;
  }

  private last = new WeakMap<HTMLElement, string>();
  private same(el: HTMLElement, v: unknown): boolean {
    const k = JSON.stringify(v, (_k, x) => (typeof x === 'function' ? 0 : x));
    if (this.last.get(el) === k) return true;
    this.last.set(el, k);
    return false;
  }

  updateQuest(v: QuestView | null): void {
    this.quest.hidden = !v;
    if (!v || this.same(this.quest, v)) return;
    clear(this.quest);
    const body = h('div', { class: 'qbody' }, v.kicker ? h('div', { class: 'kicker', text: v.kicker }) : null, h('div', { class: 'qtitle', text: v.title }));
    if (v.progress) body.append(this.progressEl(v.progress));
    body.append(h('div', { class: 'goal', text: v.goal }));
    const b = this.buttonsEl(v.buttons);
    if (b) body.append(b);
    this.quest.append(h('div', { class: 'band' }), body);
  }

  updateInfo(v: InfoView | null): void {
    this.info.hidden = !v;
    if (!v || this.same(this.info, v)) return;
    clear(this.info);
    const body = h('div', { class: 'qbody' }, h('div', { class: 'kicker', text: v.kicker }), h('div', { class: 'qtitle', text: v.title }));
    if (v.rows.length) {
      const dl = h('dl', { class: 'stats' });
      for (const [k, val] of v.rows) dl.append(h('dt', { text: k }), h('dd', { text: val }));
      body.append(dl);
    }
    if (v.note) body.append(h('div', { class: 'note', text: v.note }));
    if (v.progress.length) {
      const f = h('div', { class: 'finds' });
      for (const p of v.progress) f.append(h('span', { text: p.label }), this.progressEl(p));
      body.append(f);
    }
    const b = this.buttonsEl(v.buttons);
    if (b) body.append(b);
    this.info.append(h('div', { class: 'band' }), body);
  }

  updateVehicle(v: { kicker: string; title: string; sub: string; alt?: number } | null): void {
    this.veh.hidden = !v;
    if (!v || this.same(this.veh, v)) return;
    clear(this.veh);
    const body = h('div', { class: 'qbody' }, h('div', { class: 'kicker', text: v.kicker }), h('div', { class: 'vtitle', text: v.title }), h('div', { class: 'vsub', text: v.sub }));
    if (v.alt !== undefined) {
      const bar = h('div', { class: 'altbar' }, h('i'));
      (bar.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, v.alt * 100))}%`;
      body.append(bar);
    }
    this.veh.append(body);
  }

  setTopButtons(items: { id: string; label: string; icon: string; count?: string; fn: () => void; short?: boolean }[]): void {
    if (this.same(this.topRow, items)) return;
    clear(this.topRow);
    for (const it of items) {
      const b = h('button', { type: 'button', class: `btn${it.short ? ' sm' : ''}`, 'aria-label': it.label, onclick: () => it.fn() });
      if (it.icon) b.innerHTML = icon(it.icon);
      b.append(h('span', { class: it.short ? '' : 'lbl', text: it.label }));
      if (it.count !== undefined) b.append(h('span', { class: 'cnt', text: it.count }));
      this.topRow.append(b);
    }
  }

  setAction(a: ActionView | null, showKey: boolean): void {
    this.curAction = a;
    this.actBtn.hidden = !a;
    if (!a) return;
    const key = a.id + a.label;
    if (this.actBtn.dataset.k === key) return;
    this.actBtn.dataset.k = key;
    this.actBtn.innerHTML = icon(a.icon);
    this.actBtn.append(h('span', { class: 'lbl', text: a.label }));
    if (showKey) this.actBtn.append(h('span', { class: 'kbd', text: 'E' }));
  }
  get action(): ActionView | null {
    return this.curAction;
  }

  setContext(c: ContextView | null): void {
    this.curCtx = c;
    this.ctxCard.hidden = !c || this.dialog.isOpen;
    if (!c || this.same(this.ctxCard, c)) return;
    clear(this.ctxCard);
    const sw = h('span', { class: 'swatch' });
    if (c.swatch) sw.style.background = `radial-gradient(circle at 35% 30%, #fff9, ${c.swatch} 45%, #000a 100%)`;
    const btn = h('button', { type: 'button', class: 'btn gold', text: c.label, onclick: () => this.curCtx?.fn() });
    this.ctxCard.append(
      h('div', { class: 'band' }),
      h('div', { class: 'qbody orow' }, c.swatch ? sw : null, h('div', { class: 'grow' }, h('div', { class: 'kicker', text: c.kicker }), h('div', { class: 'qtitle', text: c.title }), h('div', { class: 'vsub', text: c.sub })), btn),
    );
  }

  setTravelBar(items: { id: string; label: string; color: string; here: boolean; done: boolean; fn: () => void }[] | null): void {
    this.travel.hidden = !items;
    if (!items || this.same(this.travel, items)) return;
    clear(this.travel);
    for (const it of items) {
      const pd = h('span', { class: 'pd' });
      pd.style.background = `radial-gradient(circle at 35% 30%, #fff8, ${it.color} 45%, #0008 100%)`;
      this.travel.append(h('button', { type: 'button', class: `chipb${it.here ? ' here' : ''}`, onclick: () => it.fn() }, pd, h('span', { text: it.label }), it.done ? h('span', { class: 'ok', text: '✓' }) : null));
    }
  }

  setButtons(defs: ButtonDef[], onJump: () => void): void {
    const key = defs.map((d) => `${d.id}:${d.label}:${d.visible}`).join('|');
    if (key === this.buttonsKey) return;
    this.buttonsKey = key;
    for (const el of this.buttonEls.values()) el.remove();
    this.buttonEls.clear();
    for (const d of defs) {
      const b = h('button', { type: 'button', class: `btn${d.round ? ' round' : ''}`, hidden: !d.visible, 'aria-label': d.label });
      b.innerHTML = icon(d.icon);
      b.append(h('span', { class: d.round ? '' : 'lbl2', text: d.label }));
      if (d.hold === 'up' || d.hold === 'down' || d.hold === 'boost') {
        const k = d.hold;
        const on = (e: Event) => {
          this.onHold(k, true);
          b.classList.add('on');
          e.preventDefault();
        };
        const off = () => {
          this.onHold(k, false);
          b.classList.remove('on');
        };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('pointerleave', off);
      } else if (d.hold === 'jump')
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          onJump();
        });
      else if (d.fn) b.addEventListener('click', d.fn);
      this.btnRow.insertBefore(b, this.actBtn);
      this.buttonEls.set(d.id, b);
    }
  }

  teacher(text: string | null): void {
    this.teacherEl.hidden = !text;
    (this.teacherEl.firstChild as HTMLElement).textContent = text ?? '';
  }

  /** Full-screen modal; returns a close function. */
  modal(content: HTMLElement, onClose?: () => void): () => void {
    const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content);
    const close = () => {
      m.remove();
      onClose?.();
    };
    m.addEventListener('click', (e) => {
      if (e.target === m) close();
    });
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    this.modalLayer.append(m);
    queueMicrotask(() => (m.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true }));
    return close;
  }
  closeModals(): boolean {
    const any = this.modalLayer.children.length > 0;
    clear(this.modalLayer);
    return any;
  }
  get modalOpen(): boolean {
    return this.modalLayer.children.length > 0;
  }

  async fadeThrough(fn: () => void | Promise<void>, reduced: boolean): Promise<void> {
    this.fade.classList.add('on');
    await new Promise((r) => setTimeout(r, reduced ? 50 : 600));
    await fn();
    await new Promise((r) => setTimeout(r, 150));
    this.fade.classList.remove('on');
  }

  /** Hyperspace streaks (horus-voyage warp). */
  warpThrough(fn: () => void, reduced: boolean): Promise<void> {
    if (reduced) return this.fadeThrough(fn, true);
    return new Promise((resolve) => {
      const cv = this.warp, ctx = cv.getContext('2d')!;
      cv.hidden = false;
      const W = (cv.width = this.root.clientWidth), H = (cv.height = this.root.clientHeight), cx = W / 2, cy = H / 2;
      const streaks = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, d: Math.random() * 40 + 5, s: 0.4 + Math.random() * 1.2, c: Math.random() < 0.3 ? '#9fe8ff' : '#ffffff' }));
      const t0 = performance.now();
      const step = (now: number) => {
        const e = (now - t0) / 1100;
        ctx.fillStyle = `rgba(2,3,10,${0.25 + e * 0.5})`;
        ctx.fillRect(0, 0, W, H);
        for (const s of streaks) {
          const sp = s.s * (1 + e * e * 30), d0 = s.d, d1 = s.d + sp * 14;
          s.d += sp * 8;
          ctx.strokeStyle = s.c;
          ctx.globalAlpha = Math.min(1, e * 2);
          ctx.lineWidth = 1 + e * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(s.a) * d0, cy + Math.sin(s.a) * d0);
          ctx.lineTo(cx + Math.cos(s.a) * d1, cy + Math.sin(s.a) * d1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (e < 1) requestAnimationFrame(step);
        else {
          ctx.fillStyle = '#02030a';
          ctx.fillRect(0, 0, W, H);
          fn();
          setTimeout(() => {
            cv.hidden = true;
            resolve();
          }, 120);
        }
      };
      requestAnimationFrame(step);
    });
  }

  flashOnce(): void {
    this.flash.classList.add('on');
    setTimeout(() => this.flash.classList.remove('on'), 60);
  }

  destroy(): void {
    this.root.remove();
  }
}
