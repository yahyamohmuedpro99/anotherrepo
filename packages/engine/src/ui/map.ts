import * as THREE from 'three';
import type { Scene } from '@rihla/pack-schema';
import { TAU } from '../math/noise.js';
import type { SceneRuntime } from '../scene/scene.js';

export interface MapMark {
  x: number;
  z: number;
  color: string;
  shape: 'dot' | 'ring' | 'square' | 'diamond' | 'triangle';
  size: number;
  edge: boolean;
}

type Xf = (v: number) => number;

/**
 * Minimap and full map, drawn from the scene: a terrain colour sample as the base, declared shapes (roads,
 * valley), entity footprints (pyramids drawn with their four faces), markers and labels. Markers use shape
 * as well as colour so they stay readable for colour-blind players.
 */
export class MapRenderer {
  private base: HTMLCanvasElement | null = null;
  private baseFor: string | null = null;

  constructor(private getScene: () => SceneRuntime | null) {}

  private mapDef(): NonNullable<Scene['map']> | null {
    return this.getScene()?.def.map ?? null;
  }

  /** A low-resolution top-down sample of the terrain colours (cached per scene). */
  private baseCanvas(sr: SceneRuntime): HTMLCanvasElement | null {
    const m = sr.def.map;
    if (!m) return null;
    if (this.base && this.baseFor === sr.def.id) return this.base;
    const N = m.sample ?? 160;
    const { x0, x1, z0, z1 } = m.bounds;
    const W = N, H = Math.max(8, Math.round((N * (z1 - z0)) / (x1 - x0)));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!, img = g.createImageData(W, H), col = new THREE.Color();
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const x = x0 + ((i + 0.5) / W) * (x1 - x0), z = z0 + ((j + 0.5) / H) * (z1 - z0);
        sr.terrain.color(x, z, col);
        const k = (j * W + i) * 4;
        img.data[k] = Math.min(255, col.r * 255 * 1.05);
        img.data[k + 1] = Math.min(255, col.g * 255 * 1.05);
        img.data[k + 2] = Math.min(255, col.b * 255 * 1.05);
        img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    this.base = c;
    this.baseFor = sr.def.id;
    return c;
  }

  drawWorld(ctx: CanvasRenderingContext2D, X: Xf, Z: Xf, s: number, W: number, H: number): void {
    const sr = this.getScene();
    const m = this.mapDef();
    if (!sr || !m) return;
    const base = this.baseCanvas(sr);
    if (base) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, X(m.bounds.x0), Z(m.bounds.z0), (m.bounds.x1 - m.bounds.x0) * s, (m.bounds.z1 - m.bounds.z0) * s);
      // beyond the sampled area
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#dbb47c';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const sh of m.shapes ?? []) {
      ctx.fillStyle = sh.color;
      ctx.strokeStyle = sh.color;
      if (sh.type === 'rect') {
        if (sh.xFrom !== undefined) {
          const vx = X(sh.xFrom);
          if (vx < W) ctx.fillRect(Math.max(0, vx), 0, W, H);
        } else ctx.fillRect(X((sh.x ?? 0) - (sh.hx ?? 1)), Z((sh.z ?? 0) - (sh.hz ?? 1)), Math.max(1, (sh.hx ?? 1) * 2 * s), Math.max(1, (sh.hz ?? 1) * 2 * s));
      } else if (sh.type === 'line' && sh.from && sh.to) {
        ctx.lineWidth = Math.max(1.5, (sh.width ?? 4) * s);
        ctx.beginPath();
        ctx.moveTo(X(sh.from[0]), Z(sh.from[1]));
        ctx.lineTo(X(sh.to[0]), Z(sh.to[1]));
        ctx.stroke();
      } else if (sh.type === 'circle') {
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.arc(X(sh.x ?? 0), Z(sh.z ?? 0), Math.max(3, (sh.r ?? 5) * s), 0, TAU);
        ctx.stroke();
      }
    }
    for (const e of sr.entities) {
      const ms = e.def.mapShape;
      if (!ms) continue;
      const items = (e.built.extra?.items as { x: number; z: number; scale: number[] }[] | undefined) ?? null;
      ctx.fillStyle = ms.color;
      if (items) {
        for (const it of items) ctx.fillRect(X(it.x - (it.scale[0]! * ms.hx) / 2), Z(it.z - (it.scale[2]! * ms.hz) / 2), Math.max(1, it.scale[0]! * ms.hx * s), Math.max(1, it.scale[2]! * ms.hz * s));
        continue;
      }
      const x0 = X(e.pos.x - ms.hx), z0 = Z(e.pos.z - ms.hz), w = ms.hx * 2 * s, d = ms.hz * 2 * s;
      ctx.fillRect(x0, z0, w, d);
      if (ms.pyramid) {
        ctx.fillStyle = shade(ms.color, -0.14);
        ctx.beginPath();
        ctx.moveTo(x0 + w, z0);
        ctx.lineTo(x0 + w, z0 + d);
        ctx.lineTo(x0 + w / 2, z0 + d / 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x0, z0 + d);
        ctx.lineTo(x0 + w, z0 + d);
        ctx.lineTo(x0 + w / 2, z0 + d / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(ms.color, -0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, z0);
        ctx.lineTo(x0 + w, z0 + d);
        ctx.moveTo(x0 + w, z0);
        ctx.lineTo(x0, z0 + d);
        ctx.stroke();
      }
    }
  }

  static mark(ctx: CanvasRenderingContext2D, x: number, y: number, m: MapMark, big: boolean): void {
    const r = m.size * (big ? 1.6 : 1);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    switch (m.shape) {
      case 'ring':
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        return;
      case 'square':
        ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        break;
      case 'diamond':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        break;
      case 'triangle':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
        break;
      default:
        ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
    if (m.shape === 'dot' && big) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, r * 0.35), 0, TAU);
      ctx.fill();
    }
  }

  static arrow(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, a: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    ctx.fillStyle = '#f6d58a';
    ctx.strokeStyle = '#0c1530';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.lineTo(-a * 0.7, a * 0.65);
    ctx.lineTo(-a * 0.35, 0);
    ctx.lineTo(-a * 0.7, -a * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
}
