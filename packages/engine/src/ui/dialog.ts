import type * as THREE from 'three';
import type { Card, Item } from '@rihla/pack-schema';
import { h, clear } from './dom.js';
import { ICONS, SCARAB_SVG, icon } from './icons.js';

export interface DOpt {
  text: string;
  prime?: boolean;
  fn?: () => void;
}
export interface DLine {
  who: string;
  glyph?: string;
  text: string;
  options?: DOpt[];
  onShow?: () => void;
  media?: { src: string; alt: string; source: string } | undefined;
  vo?: string | null;
}
export interface DOpts {
  locked?: boolean;
  ttl?: number;
  endLabel?: string;
  onEnd?: () => void;
  anchor?: { pos: THREE.Vector3 } | undefined;
  /** Replace whatever is showing instead of queueing behind it. */
  replace?: boolean;
  /** Called when this dialogue closes for any reason. */
  onClose?: () => void;
}

interface Open {
  lines: DLine[];
  i: number;
  opts: DOpts;
  custom?: (body: HTMLElement) => void;
}

/**
 * The one dialogue box: guide lines, evidence cards and questions all appear here, subtitles always on.
 * New content queues behind what is showing (so a card and the radio call after it both get read), except
 * ambient lines with a timeout, which are replaced.
 */
export class DialogBox {
  readonly el: HTMLElement;
  private portrait: HTMLElement;
  private who: HTMLElement;
  private body: HTMLElement;
  private textEl: HTMLElement;
  private mediaEl: HTMLElement;
  private srcEl: HTMLElement;
  private opts: HTMLElement;
  private next: HTMLButtonElement;
  private cur: Open | null = null;
  private queue: Open[] = [];
  onChange: (open: boolean) => void = () => {};
  onVo: (url: string | null | undefined) => void = () => {};

  constructor(private labels: { next: () => string; close: () => string }) {
    this.portrait = h('div', { class: 'portrait', 'aria-hidden': 'true' });
    this.who = h('div', { class: 'who' });
    this.textEl = h('p', { class: 'dtext' });
    this.body = h('div', {}, this.who, this.textEl);
    this.mediaEl = h('div', { class: 'dmedia', hidden: true });
    this.srcEl = h('div', { class: 'dsrc', hidden: true });
    this.opts = h('div', { class: 'opts', hidden: true });
    this.next = h('button', { class: 'btn gold', type: 'button', onclick: () => this.advance() });
    this.el = h(
      'section',
      { class: 'dialog card', hidden: true, 'aria-live': 'polite', role: 'dialog' },
      h('div', { class: 'band' }),
      h('div', { class: 'dlg' }, this.portrait, this.body, this.mediaEl, this.srcEl, this.opts, h('div', { class: 'dacts' }, this.next)),
    );
  }

  get isOpen(): boolean {
    return !!this.cur;
  }
  get locked(): boolean {
    return !!this.cur?.opts.locked;
  }

  open(lines: DLine[], opts: DOpts = {}): void {
    if (!lines.length) return;
    const o: Open = { lines, i: 0, opts };
    this.push(o);
  }

  openCustom(header: { who: string; glyph?: string }, build: (body: HTMLElement) => void, opts: DOpts = {}): void {
    this.push({ lines: [{ who: header.who, glyph: header.glyph ?? '؟', text: '' }], i: 0, opts: { locked: true, ...opts }, custom: build });
  }

  private push(o: Open): void {
    if (!this.cur) {
      this.cur = o;
      this.render();
      return;
    }
    if (o.opts.replace && !this.cur.opts.locked) {
      this.finish(false);
      this.cur = o;
      this.render();
      return;
    }
    if (this.cur.opts.ttl && !this.cur.opts.locked && !this.cur.custom) {
      // ambient lines yield to anything new
      this.finish(false);
      this.cur = o;
      this.render();
      return;
    }
    this.queue.push(o);
    if (this.queue.length > 4) this.queue.shift();
  }

  /** Close the current dialogue. `runEnd` runs its onEnd (only when the player finished reading). */
  close(runEnd = false): void {
    this.finish(runEnd);
    this.cur = this.queue.shift() ?? null;
    this.render();
  }

  /** Drop everything (scene change, teacher end). */
  reset(): void {
    this.queue = [];
    this.finish(false);
    this.cur = null;
    this.render();
  }

  private finish(runEnd: boolean): void {
    const c = this.cur;
    if (!c) return;
    this.onVo(null);
    c.opts.onClose?.();
    if (runEnd) c.opts.onEnd?.();
  }

  private advance(): void {
    const c = this.cur;
    if (!c || c.custom) return;
    if (c.i < c.lines.length - 1) {
      c.i++;
      this.render();
    } else {
      // close first so onEnd can open the next dialogue
      const end = c.opts.onEnd;
      c.opts.onEnd = undefined;
      this.close(false);
      end?.();
    }
  }

  tick(dt: number, player: THREE.Vector3 | null): void {
    const c = this.cur;
    if (!c) return;
    if (c.opts.ttl && !c.opts.locked) {
      c.opts.ttl -= dt;
      if (c.opts.ttl <= 0) this.close(false);
    }
    const a = c.opts.anchor;
    if (a && player && !c.opts.locked && Math.hypot(a.pos.x - player.x, a.pos.z - player.z) > 30) this.close(false);
  }

  private render(): void {
    const c = this.cur;
    this.el.hidden = !c;
    this.onChange(!!c);
    if (!c) return;
    const L = c.lines[c.i]!;
    const g = L.glyph ?? '';
    if (g === 'scarab') {
      this.portrait.innerHTML = SCARAB_SVG;
      this.portrait.firstElementChild?.classList.add('on');
    } else if (ICONS[g]) this.portrait.innerHTML = icon(g);
    else this.portrait.textContent = g;
    this.who.textContent = L.who;
    this.textEl.textContent = L.text;
    this.textEl.hidden = !L.text;
    this.textEl.dir = 'auto';
    clear(this.mediaEl);
    this.mediaEl.hidden = !L.media;
    this.srcEl.hidden = !L.media;
    if (L.media) {
      this.mediaEl.append(h('img', { src: L.media.src, alt: L.media.alt, loading: 'lazy' }));
      this.srcEl.textContent = L.media.source;
    }
    clear(this.opts);
    if (c.custom) {
      this.opts.hidden = false;
      this.next.hidden = true;
      c.custom(this.opts);
    } else {
      this.opts.hidden = !L.options;
      this.next.hidden = !!L.options;
      for (const o of L.options ?? []) {
        this.opts.append(
          h('button', {
            type: 'button',
            class: 'opt' + (o.prime ? ' prime' : ''),
            text: o.text,
            onclick: () => {
              this.close(false);
              o.fn?.();
            },
          }),
        );
      }
      this.next.textContent = c.i < c.lines.length - 1 ? this.labels.next() : (c.opts.endLabel ?? this.labels.close());
    }
    this.onVo(L.vo);
    L.onShow?.();
    if (!L.options && !c.custom) queueMicrotask(() => this.next.focus({ preventScroll: true }));
  }
}

/* ---------------------------------------------------------------- assessment items */

export interface ItemCallbacks {
  t: (key: string, params?: Record<string, string | number>) => string;
  num: (n: number) => string;
  hints: boolean;
  onAttempt: (correct: boolean, attempt: number, response: string) => void;
  onHint: () => void;
  onCorrect: () => void;
  toast: (text: string, kind?: 'gold' | 'warn') => void;
  sfx: (k: 'success' | 'error' | 'click') => void;
  /** Pre/post quizzes accept the first answer and move on (no retries). */
  oneShot?: boolean;
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Parses a typed number in either numeral system (١٤٦٫٦ or 146.6). */
export function parseNumber(s: string): number {
  const western = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٫,]/g, '.').replace(/[^\d.\-]/g, '');
  return western ? Number(western) : NaN;
}

export function renderItem(box: DialogBox, item: Item, who: string, cb: ItemCallbacks): void {
  let attempt = 0;
  let done = false;
  const right = (response: string, el?: HTMLElement) => {
    if (done) return;
    done = true;
    attempt++;
    el?.classList.add('right');
    cb.onAttempt(true, attempt, response);
    cb.sfx('success');
    setTimeout(() => {
      box.close(false);
      cb.onCorrect();
    }, 800);
  };
  const wrong = (response: string, el?: HTMLElement) => {
    attempt++;
    cb.onAttempt(false, attempt, response);
    cb.sfx('error');
    if (cb.oneShot) {
      done = true;
      el?.classList.add('wrong');
      setTimeout(() => {
        box.close(false);
        cb.onCorrect();
      }, 600);
      return;
    }
    el?.classList.add('wrong');
    if (el instanceof HTMLButtonElement) el.disabled = true;
    if (cb.hints) {
      cb.onHint();
      cb.toast(cb.t(item.hint));
    } else cb.toast(cb.t('engine.wrong'));
  };
  box.openCustom({ who, glyph: '؟' }, (body) => {
    body.append(h('p', { class: 'dtext', text: cb.t(item.prompt), dir: 'auto' }));
    if (item.type === 'mcq') {
      const opts = item.shuffle === false ? item.options ?? [] : shuffled(item.options ?? []);
      for (const o of opts) {
        const b = h('button', { type: 'button', class: 'opt', text: cb.t(o.text) });
        b.addEventListener('click', () => (o.correct ? right(o.id ?? o.text, b) : wrong(o.id ?? o.text, b)));
        body.append(b);
      }
    } else if (item.type === 'numeric') {
      const input = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': cb.t('engine.yourAnswer'), placeholder: cb.t('engine.yourAnswer'), dir: 'auto' });
      const unit = item.unit ? h('span', { text: cb.t(item.unit) }) : null;
      const go = h('button', { type: 'button', class: 'btn gold', text: cb.t('engine.check') });
      const submit = () => {
        const v = parseNumber(input.value);
        if (!Number.isFinite(v)) return;
        if (Math.abs(v - (item.answer ?? 0)) <= (item.tolerance ?? 0)) right(String(v), input);
        else {
          wrong(String(v));
          input.select();
        }
      };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      body.append(h('div', { class: 'numrow' }, input, unit, go));
      queueMicrotask(() => input.focus({ preventScroll: true }));
    } else if (item.type === 'ordering') {
      const correct = (item.options ?? []).map((o) => o.text);
      const picked: string[] = [];
      const list = h('div', { class: 'opts' });
      const status = h('div', { class: 'note', text: cb.t('engine.orderHint') });
      const renderOrder = () => {
        clear(list);
        for (const k of shuffledOnce) {
          const idx = picked.indexOf(k);
          const b = h('button', { type: 'button', class: 'opt' + (idx >= 0 ? ' picked' : ''), text: (idx >= 0 ? `${cb.num(idx + 1)}. ` : '') + cb.t(k) });
          b.addEventListener('click', () => {
            if (idx >= 0) return;
            picked.push(k);
            cb.sfx('click');
            if (picked.length === correct.length) {
              const ok = picked.every((p, i) => p === correct[i]);
              if (ok) right(picked.join('>'));
              else {
                wrong(picked.join('>'));
                picked.length = 0;
              }
            }
            renderOrder();
          });
          list.append(b);
        }
      };
      const shuffledOnce = shuffled(correct);
      body.append(status, list);
      renderOrder();
    } else if (item.type === 'matching') {
      const pairs = item.pairs ?? [];
      const rights = shuffled(pairs.map((p) => p[1]));
      const matched = new Map<string, string>();
      let sel: string | null = null;
      const grid = h('div', { class: 'opts' });
      const status = h('div', { class: 'note', text: cb.t('engine.matchHint') });
      const draw = () => {
        clear(grid);
        pairs.forEach(([l], i) => {
          const b = h('button', { type: 'button', class: 'opt' + (sel === l ? ' picked' : '') + (matched.has(l) ? ' right' : ''), text: cb.t(l) + (matched.has(l) ? ` → ${cb.t(matched.get(l)!)}` : '') });
          b.addEventListener('click', () => {
            if (matched.has(l)) return;
            sel = l;
            draw();
          });
          grid.append(b);
          const r = rights[i]!;
          const used = [...matched.values()].includes(r);
          const rb = h('button', { type: 'button', class: 'opt' + (used ? ' right' : ''), text: cb.t(r) });
          rb.addEventListener('click', () => {
            if (!sel || used) return;
            const pair = pairs.find((p) => p[0] === sel)!;
            if (pair[1] === r) {
              matched.set(sel, r);
              sel = null;
              cb.sfx('click');
              if (matched.size === pairs.length) right([...matched].map(([a, b2]) => `${a}=${b2}`).join(','));
            } else wrong(`${sel}=${r}`);
            draw();
          });
          grid.append(rb);
        });
      };
      body.append(status, grid);
      draw();
    } else {
      // hotspot: choose among labelled places (the map variant is drawn by the map panel)
      for (const hs of shuffled(item.hotspots ?? [])) {
        const b = h('button', { type: 'button', class: 'opt', text: hs.label ? cb.t(hs.label) : hs.id });
        b.addEventListener('click', () => (hs.correct ? right(hs.id, b) : wrong(hs.id, b)));
        body.append(b);
      }
    }
  });
}

export function cardLines(card: Card, t: (k: string) => string, who: string, glyph: string): DLine[] {
  const m = card.media;
  return [
    {
      who,
      glyph,
      text: t(card.body),
      media: m ? { src: m.src, alt: t(m.title), source: `${m.attribution} · ${m.licence}` } : undefined,
    },
  ];
}
