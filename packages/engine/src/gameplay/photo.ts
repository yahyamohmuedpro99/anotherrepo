import * as THREE from 'three';
import type { EngineApi } from '../core/api.js';
import type { Player } from '../controllers/player.js';
import type { EntityRT } from '../scene/scene.js';
import { storage } from '../core/storage.js';

interface Req {
  t: number;
  shot: boolean;
  spot: EntityRT | null;
  dur: number;
  pos?: THREE.Vector3;
  look?: THREE.Vector3;
}

/** Photo mode: frame, flash, caption, album. Standing on a photo spot frames its postcard view. */
export class PhotoSystem {
  req: Req | null = null;
  onFrame: (on: boolean) => void = () => {};
  onFlash: () => void = () => {};

  constructor(private e: EngineApi, private player: Player) {
    this.e.state.album = storage.json(this.key, []).filter((p: { src?: unknown }) => typeof p?.src === 'string' && (p.src as string).startsWith('data:image/'));
  }

  private get key(): string {
    return `rihla.album.${this.e.manifest.id}`;
  }
  private get max(): number {
    return this.e.manifest.hud.album?.max ?? 12;
  }

  take(): void {
    if (this.req || !this.e.scene) return;
    const sc = this.e.scene;
    let spot: EntityRT | null = null;
    for (const ent of sc.entities) {
      const ph = ent.def.photo;
      if (!ph || !ent.visible) continue;
      if (ph.sky) {
        if (this.e.altitude() >= ph.sky.minAltitude && (!ph.sky.vehicle || this.e.vehicle() === ph.sky.vehicle)) spot = ent;
      } else if (this.player.vehPreset !== 'balloon' && Math.hypot(ent.pos.x - this.player.pos.x, ent.pos.z - this.player.pos.z) < (ph.radius ?? 7)) spot = ent;
    }
    const framed = !!(spot?.def.photo?.cam && spot.def.photo.look);
    const req: Req = { t: 0, shot: false, spot, dur: framed ? 1.7 : 0.45 };
    if (framed) {
      const c = spot!.def.photo!.cam!, l = spot!.def.photo!.look!;
      req.pos = new THREE.Vector3(c[0], sc.height(c[0], c[2]) + c[1], c[2]);
      req.look = new THREE.Vector3(l[0], l[1], l[2]);
    }
    this.req = req;
    this.onFrame(true);
    this.e.audio.sfx('shutter');
  }

  /** Called every frame after the camera update and before render. */
  applyCamera(cam: THREE.Camera): void {
    const r = this.req;
    if (r?.pos && r.look) {
      cam.position.copy(r.pos);
      cam.lookAt(r.look);
    }
  }

  /** Called right after render (the drawing buffer is still valid). */
  afterRender(dt: number, canvas: HTMLCanvasElement, areaName: () => string): void {
    const r = this.req;
    if (!r) return;
    r.t += dt;
    if (!r.shot && r.t >= (r.pos ? 0.6 : 0.06)) {
      r.shot = true;
      this.capture(canvas, r.spot ? this.e.t(r.spot.def.photo!.name) : areaName());
    }
    if (r.t >= r.dur) {
      this.req = null;
      this.onFrame(false);
    }
  }

  private capture(src: HTMLCanvasElement, caption: string): void {
    const W = 480, H = 300, c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    let sx = 0, sy = 0, sw = src.width, sh = src.height;
    if (sw / sh > W / H) {
      const nw = (sh * W) / H;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = (sw * H) / W;
      sy = (sh - nh) / 2;
      sh = nh;
    }
    try {
      g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    } catch {
      return;
    }
    const gr = g.createLinearGradient(0, H - 70, 0, H);
    gr.addColorStop(0, 'rgba(12,21,48,0)');
    gr.addColorStop(1, 'rgba(12,21,48,0.75)');
    g.fillStyle = gr;
    g.fillRect(0, H - 70, W, 70);
    const ar = this.e.tr.dir === 'rtl';
    g.fillStyle = '#f6d58a';
    g.font = ar ? '700 24px "Aref Ruqaa", Tahoma, serif' : '600 18px "Reem Kufi", Tahoma, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = ar ? 'rtl' : 'ltr';
    g.fillText(caption, W / 2, H - 24);
    g.strokeStyle = 'rgba(246,213,138,0.8)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, W - 16, H - 16);
    let url = '';
    try {
      url = c.toDataURL('image/jpeg', 0.8);
    } catch {
      return;
    }
    this.add(url, caption);
    this.onFlash();
    this.e.run([{ do: 'show.toast', text: 'engine.photoSaved', ms: 2600 }]);
    const spot = this.req?.spot;
    const ph = spot?.def.photo;
    if (spot && ph && this.e.state.add(ph.counter, spot.id)) {
      const of = this.e.manifest.counters.find((x) => x.id === ph.counter)?.of ?? 0;
      if (this.e.tr.has('photo.spotDone')) this.e.run([{ do: 'show.toast', text: { key: 'photo.spotDone', params: { n: { counter: ph.counter }, m: { literal: of } } }, kind: 'gold', ms: 4000 }]);
    }
    this.e.emit('took-photo', { type: 'photo', id: spot?.id ?? 'free' });
  }

  add(src: string, caption: string): void {
    const al = this.e.state.album;
    al.push({ src, caption, t: Date.now() });
    while (al.length > this.max) al.shift();
    for (let n = al.length; n >= 0; n--) if (storage.set(this.key, JSON.stringify(al.slice(al.length - n)))) break;
    this.e.state.changed();
  }
}
