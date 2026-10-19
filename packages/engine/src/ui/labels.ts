import * as THREE from 'three';
import { h } from './dom.js';
import { icon } from './icons.js';

export interface Tag {
  el: HTMLElement;
  nm: HTMLElement;
  chip: HTMLElement;
  bang: HTMLElement;
  ok: HTMLElement;
  bubble: HTMLElement;
}

export function makeTag(text: string, o: { style?: string; dot?: string; icon?: string; me?: boolean } = {}): Tag {
  const nm = h('span', { dir: 'auto', text });
  const dot = h('span', { class: 'dot', hidden: !o.dot });
  if (o.dot) dot.style.background = o.dot;
  const chip = h('span', { class: 'chip', hidden: true });
  const bang = h('span', { class: 'bang', text: '!', hidden: true });
  const ok = h('span', { class: 'ok', text: '✓', hidden: true });
  const row = h('div', { class: 'name' }, dot);
  if (o.icon) row.insertAdjacentHTML('beforeend', icon(o.icon));
  row.append(nm, chip, bang, ok);
  const bubble = h('div', { class: 'bubble', hidden: true, dir: 'auto' });
  const el = h('div', { class: `tag ${o.style ?? ''}${o.me ? ' me' : ''}` }, bubble, row);
  return { el, nm, chip, bang, ok, bubble };
}

interface Label {
  el: HTMLElement;
  getPos: (v: THREE.Vector3) => void;
  max: number;
  min: number;
  fade: number;
  cond: (() => boolean) | null;
}

const v3 = new THREE.Vector3();

/** DOM labels projected over the 3D world (names, rides, landmarks). */
export class Labels {
  readonly layer = h('div', { class: 'r-labels', 'aria-hidden': 'true' });
  private list: Label[] = [];
  hideAll = false;

  add(el: HTMLElement, getPos: (v: THREE.Vector3) => void, o: { max?: number; min?: number; fade?: number; cond?: () => boolean } = {}): Label {
    const L: Label = { el, getPos, max: o.max ?? 300, min: o.min ?? 0, fade: o.fade ?? 0, cond: o.cond ?? null };
    el.hidden = true;
    this.layer.append(el);
    this.list.push(L);
    return L;
  }
  remove(L: Label | null | undefined): void {
    if (!L) return;
    L.el.remove();
    this.list = this.list.filter((x) => x !== L);
  }
  clear(): void {
    for (const L of this.list) L.el.remove();
    this.list = [];
  }

  update(camera: THREE.Camera, W: number, H: number): void {
    for (const L of this.list) {
      if (this.hideAll || (L.cond && !L.cond())) {
        if (!L.el.hidden) L.el.hidden = true;
        continue;
      }
      L.getPos(v3);
      const d = v3.distanceTo(camera.position);
      v3.project(camera);
      const vis = v3.z < 1 && v3.z > -1 && d <= L.max && d >= L.min && Math.abs(v3.x) < 1.15 && Math.abs(v3.y) < 1.15;
      if (!vis) {
        if (!L.el.hidden) L.el.hidden = true;
        continue;
      }
      if (L.el.hidden) L.el.hidden = false;
      L.el.style.transform = `translate3d(${((v3.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * H).toFixed(1)}px,0) translate(-50%,-100%)`;
      if (L.fade) L.el.style.opacity = String(Math.min(1, Math.max(0.35, 1 - (d - L.fade) / Math.max(1, L.max - L.fade))));
    }
  }
}
