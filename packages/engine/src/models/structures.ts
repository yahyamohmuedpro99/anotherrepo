import * as THREE from 'three';
import type { MaterialRef } from '@rihla/pack-schema';
import { TAU, clamp, rng } from '../math/noise.js';
import { makeCanvas, textureFor } from '../world/textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildCtx, Built } from './context.js';

/* ---------------------------------------------------------------- stepped pyramid (silent-sphinx) */

/** Real courses of stone, weathered at the base, sand on the ledges. */
function stepGeo(half: number, H: number, hTop: number, layers: number, seed: number, tile = 9): THREE.BufferGeometry {
  const P: number[] = [], UV: number[] = [], C: number[] = [];
  const r = rng(seed), dh = hTop / layers;
  const dark = new THREE.Color('#b59468'), light = new THREE.Color('#e8d2a6'), sandy = new THREE.Color('#e3bf86'), col = new THREE.Color(), lcol = new THREE.Color();
  const v = (x: number, y: number, z: number, u: number, w: number, c: THREE.Color) => {
    P.push(x, y, z);
    UV.push(u, w);
    C.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < layers; i++) {
    const y0 = i * dh, y1 = y0 + dh, hw = half * (1 - y0 / H), hw2 = half * (1 - y1 / H), k = y0 / H;
    col.copy(dark).lerp(light, clamp(k * 1.4, 0, 1)).multiplyScalar(0.9 + r() * 0.18);
    lcol.copy(col).lerp(sandy, 0.45).multiplyScalar(1.06);
    const cs = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]] as const;
    const ci = [[-hw2, -hw2], [hw2, -hw2], [hw2, hw2], [-hw2, hw2]] as const;
    const v0 = (i % 8) / 8, v1 = v0 + 1 / 8;
    for (let s = 0; s < 4; s++) {
      const a = cs[(s + 1) % 4]!, b = cs[s]!, L = hw * 2, off = s * 3.7 + i * 1.31;
      const ua = (L + off) / tile, ub = off / tile;
      v(a[0], y0, a[1], ua, v0, col);
      v(b[0], y0, b[1], ub, v0, col);
      v(b[0], y1, b[1], ub, v1, col);
      v(a[0], y0, a[1], ua, v0, col);
      v(b[0], y1, b[1], ub, v1, col);
      v(a[0], y1, a[1], ua, v1, col);
      const o0 = cs[s]!, o1 = cs[(s + 1) % 4]!, i0 = ci[s]!, i1 = ci[(s + 1) % 4]!;
      v(o0[0], y1, o0[1], o0[0] / tile, o0[1] / tile, lcol);
      v(i0[0], y1, i0[1], i0[0] / tile, i0[1] / tile, lcol);
      v(i1[0], y1, i1[1], i1[0] / tile, i1[1] / tile, lcol);
      v(o0[0], y1, o0[1], o0[0] / tile, o0[1] / tile, lcol);
      v(i1[0], y1, i1[1], i1[0] / tile, i1[1] / tile, lcol);
      v(o1[0], y1, o1[1], o1[0] / tile, o1[1] / tile, lcol);
    }
    if (i === layers - 1) {
      const h = hw2;
      v(-h, y1, -h, 0, 0, lcol);
      v(-h, y1, h, 0, h / tile, lcol);
      v(h, y1, h, h / tile, h / tile, lcol);
      v(-h, y1, -h, 0, 0, lcol);
      v(h, y1, h, h / tile, h / tile, lcol);
      v(h, y1, -h, h / tile, 0, lcol);
    }
  }
  return finish(P, UV, C);
}

/** Smooth casing: a frustum from yb to yt. */
function frustumGeo(hb: number, ht: number, yb: number, yt: number, tile: number, c0: THREE.Color, c1: THREE.Color, cap = true): THREE.BufferGeometry {
  const P: number[] = [], UV: number[] = [], C: number[] = [];
  const v = (x: number, y: number, z: number, u: number, w: number, c: THREE.Color) => {
    P.push(x, y, z);
    UV.push(u, w);
    C.push(c.r, c.g, c.b);
  };
  const B = [[-hb, -hb], [hb, -hb], [hb, hb], [-hb, hb]] as const, Tp = [[-ht, -ht], [ht, -ht], [ht, ht], [-ht, ht]] as const;
  for (let s = 0; s < 4; s++) {
    const a = (s + 1) % 4, b = s, sl = Math.hypot(yt - yb, hb - ht);
    v(B[a]![0], yb, B[a]![1], (hb * 2) / tile, 0, c0);
    v(B[b]![0], yb, B[b]![1], 0, 0, c0);
    v(Tp[b]![0], yt, Tp[b]![1], (hb - ht) / tile, sl / tile, c1);
    v(B[a]![0], yb, B[a]![1], (hb * 2) / tile, 0, c0);
    v(Tp[b]![0], yt, Tp[b]![1], (hb - ht) / tile, sl / tile, c1);
    v(Tp[a]![0], yt, Tp[a]![1], (hb + ht) / tile, sl / tile, c1);
  }
  if (cap && ht > 0.01) {
    const h = ht;
    v(-h, yt, -h, 0, 0, c1);
    v(-h, yt, h, 0, 1, c1);
    v(h, yt, h, 1, 1, c1);
    v(-h, yt, -h, 0, 0, c1);
    v(h, yt, h, 1, 1, c1);
    v(h, yt, -h, 1, 0, c1);
  }
  return finish(P, UV, C);
}

function finish(P: number[], UV: number[], C: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

export interface PyramidParams {
  half: number;
  H: number;
  hTop: number;
  layers: number;
  seed?: number;
  tile?: number;
  casingFrom?: number;
  granite?: number;
  gash?: boolean;
  mast?: boolean;
  /** Joins the night light show (hue-cycling emissive). */
  show?: boolean;
}

export function buildPyramid(p: PyramidParams, x: number, z: number, ctx: BuildCtx): Built {
  const { half, H } = p;
  let y0 = ctx.height(x, z);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) y0 = Math.min(y0, ctx.height(x + a! * half, z + b! * half));
  y0 -= 0.6;
  const grp = new THREE.Group();
  const night = p.show ? { night: { intensity: 0.5, mode: 'hue-cycle' as const } } : {};
  const coreTop = p.casingFrom != null ? p.casingFrom + 2 : p.hTop;
  const layers = ctx.quality.tier === 'low' ? Math.max(3, Math.round(p.layers * 0.5)) : p.layers;
  const mat = ctx.materials.get({ map: { gen: 'stone', seed: 11, repeat: [1, 1] }, vertexColors: true, roughness: 0.95, emissive: '#000000', ...night });
  const core = new THREE.Mesh(stepGeo(half, H, coreTop, Math.max(3, Math.round((layers * coreTop) / p.hTop)), p.seed ?? 3, p.tile ?? 9), mat);
  core.castShadow = core.receiveShadow = ctx.shadows;
  core.userData.ground = true;
  ctx.pickables.push(core);
  grp.add(core);
  if (p.casingFrom != null) {
    const cm = ctx.materials.get({ map: { gen: 'casing', seed: 13, repeat: [1, 1] }, vertexColors: true, roughness: 0.8, emissive: '#000000', ...night });
    const hb = half * (1 - p.casingFrom / H) + 1.1, ht = half * (1 - p.hTop / H) + 0.3;
    const cas = new THREE.Mesh(frustumGeo(hb, ht, p.casingFrom, p.hTop, 24, new THREE.Color('#e4cfa6'), new THREE.Color('#f3e6c9')), cm);
    cas.castShadow = cas.receiveShadow = ctx.shadows;
    grp.add(cas);
  }
  if (p.granite) {
    const gm = ctx.materials.get({ map: { gen: 'granite', seed: 17, size: 128, repeat: [1, 1] }, vertexColors: true, roughness: 0.6, emissive: '#000000', ...night });
    const gh = p.granite, hb = half + 0.5, ht = half * (1 - gh / H) + 0.5;
    const gr = new THREE.Mesh(frustumGeo(hb, ht, 0, gh, 6, new THREE.Color('#8a5848'), new THREE.Color('#b07a64'), false), gm);
    gr.castShadow = gr.receiveShadow = ctx.shadows;
    grp.add(gr);
  }
  if (p.gash) {
    const yA = 6, yB = 30, wA = 9, wB = 4, zA = -(half * (1 - yA / H)) - 0.25, zB = -(half * (1 - yB / H)) - 0.25;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([wA / 2, yA, zA, -wA / 2, yA, zA, -wB / 2, yB, zB, wA / 2, yA, zA, -wB / 2, yB, zB, wB / 2, yB, zB], 3));
    g.computeVertexNormals();
    grp.add(new THREE.Mesh(g, ctx.materials.get({ color: '#6a4e34', roughness: 1 })));
  }
  if (p.mast) {
    // the survey mast on top shows the original height; three legs merged into one mesh
    const legs: THREE.BufferGeometry[] = [];
    const o = new THREE.Object3D();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU, leg = new THREE.CylinderGeometry(0.06, 0.06, 8.6, 5);
      o.position.set(Math.cos(a) * 0.7, p.hTop + 4.2, Math.sin(a) * 0.7);
      o.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
      o.updateMatrix();
      legs.push(leg.applyMatrix4(o.matrix));
    }
    grp.add(new THREE.Mesh(mergeGeometries(legs)!, ctx.materials.get({ color: '#4f4237', roughness: 0.8 })));
  }
  ctx.solids.push({ kind: 'pyr', x, z, hx: half, hz: half, y0, h: H });
  return { object: grp, baseY: y0, labelY: p.hTop + 12 };
}

/** A plain four-sided pyramid (distant or stylised scenes). */
export function buildSimplePyramid(half: number, h: number, ctx: BuildCtx): Built {
  const P: number[] = [], uv: number[] = [];
  const c = [[-half, -half], [half, -half], [half, half], [-half, half]] as const;
  for (let i = 0; i < 4; i++) {
    const a = c[i]!, b = c[(i + 1) % 4]!;
    P.push(b[0], 0, b[1], a[0], 0, a[1], 0, h, 0);
    uv.push(1, 0, 0, 0, 0.5, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, ctx.materials.get({ map: { gen: 'stone', seed: 11, params: { variant: 'simple' }, repeat: [+(half / 3).toFixed(2), +(h / 4).toFixed(2)] }, roughness: 0.95, flatShading: true }));
  m.castShadow = ctx.shadows;
  return { object: m };
}

/* ---------------------------------------------------------------- roads that follow the terrain */

export function buildStrip(from: [number, number], to: [number, number], w: number, material: MaterialRef, lift: number, seg: number, ctx: BuildCtx): Built {
  const [x0, z0] = from, [x1, z1] = to;
  const L = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(w, L, 1, seg);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.atan2(x1 - x0, z1 - z0));
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, ctx.height(p.getX(i), p.getZ(i)) + lift);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, ctx.materials.get(material));
  m.receiveShadow = ctx.shadows;
  return { object: m };
}

/* ---------------------------------------------------------------- Arabic street signs */

export function buildSign(textKey: string, w: number, y: number, bg: string, ctx: BuildCtx): Built {
  const c = makeCanvas(512, 128), g = c.getContext('2d')!, tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#e9b44c';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 112);
    g.fillStyle = '#f6d58a';
    g.font = '700 62px "Aref Ruqaa", "Reem Kufi", Tahoma, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    // Street signs on the plateau are written in Arabic whatever the UI language.
    g.fillText(ctx.t(textKey), 256, 70);
    tex.needsUpdate = true;
  };
  draw();
  ctx.redraws.push(draw);
  const grp = new THREE.Group();
  const back = ctx.materials.get({ color: '#2a2a26', roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, w / 4, 0.12), [back, back, back, back, front, back]);
  board.position.y = y;
  board.castShadow = ctx.shadows;
  grp.add(board);
  const posts = [-w * 0.38, w * 0.38].map((px) => new THREE.CylinderGeometry(0.08, 0.08, y, 6).translate(px, y / 2 - w / 8, -0.1));
  const pm = new THREE.Mesh(mergeGeometries(posts)!, ctx.materials.get({ color: '#4a3b2c', roughness: 0.9 }));
  pm.castShadow = ctx.shadows;
  grp.add(pm);
  return { object: grp };
}

/** Texture helper re-exported for generators that need a one-off map. */
export { textureFor };
