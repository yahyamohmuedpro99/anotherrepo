import * as THREE from 'three';
import type { ColorLayer, HeightLayer, Mask, Terrain } from '@rihla/pack-schema';
import { TAU, clamp, fbm, fbm3, hexRgb, mixRgb, rng, smooth } from '../math/noise.js';
import { canvasFor, makeCanvas, textureFor } from './textures.js';

export type HeightFn = (x: number, z: number) => number;
type ColorFn = (x: number, z: number, out: THREE.Color) => THREE.Color;

const coordOf = (coord: string | undefined, center: [number, number] | undefined, x: number, z: number) =>
  coord === 'z' ? z : coord === 'r' ? Math.hypot(x - (center?.[0] ?? 0), z - (center?.[1] ?? 0)) : x;

function maskFn(masks: Mask[] | undefined): (x: number, z: number) => number {
  if (!masks?.length) return () => 1;
  return (x, z) => {
    let m = 1;
    for (const k of masks) m *= (k.base ?? 0) + (k.gain ?? 1) * smooth(k.from, k.to, coordOf(k.coord, k.center, x, z));
    return m;
  };
}

interface Crater {
  x: number;
  z: number;
  r: number;
  d: number;
  lim: number;
}

export function cratersOf(layer: HeightLayer): Crater[] {
  const out: Crater[] = [];
  if (layer.random) {
    const r = rng(layer.random.seed);
    const avoid = layer.random.avoid ?? [];
    const A = layer.random.area;
    for (let i = 0; i < layer.random.count; i++) {
      let x = 0, z = 0, guard = 0;
      do {
        x = (r() - 0.5) * A;
        z = (r() - 0.5) * A;
      } while (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar) && guard++ < 50);
      const rad = 4 + Math.pow(r(), 2) * 30;
      out.push({ x, z, r: rad, d: rad * 0.18, lim: rad * 1.9 * (rad * 1.9) });
    }
  }
  for (const c of layer.craters ?? []) out.push({ x: c.at[0], z: c.at[1], r: c.r, d: c.depth, lim: c.r * 2 * (c.r * 2) });
  return out;
}

export function heightFunction(t: Terrain | undefined): HeightFn {
  if (!t || t.type !== 'layers' || !t.layers?.length) return () => 0;
  const parts: HeightFn[] = t.layers.map((L) => {
    const m = maskFn(L.masks);
    const amp = L.amp ?? 1;
    switch (L.type) {
      case 'fbm': {
        const f = L.freq ?? 0.01, ox = L.offset?.[0] ?? 0, oz = L.offset?.[1] ?? 0, b = L.bias ?? 0;
        return (x, z) => (fbm(x * f + ox, z * f + oz) + b) * amp * m(x, z);
      }
      case 'smooth':
        return (x, z) => smooth(L.from ?? 0, L.to ?? 1, coordOf(L.coord, L.center, x, z)) * amp * m(x, z);
      case 'gauss': {
        const ax = L.at?.[0] ?? 0, az = L.at?.[1] ?? 0, w = L.width ?? 1;
        return (x, z) => amp * Math.exp(-((x - ax) * (x - ax) + (z - az) * (z - az)) / w) * m(x, z);
      }
      case 'bowl': {
        const from = L.from ?? 0, k = L.k ?? 1000;
        return (x, z) => {
          const over = Math.max(0, coordOf('r', L.center, x, z) - from);
          return (-over * over) / k;
        };
      }
      case 'craters': {
        const cr = cratersOf(L);
        return (x, z) => {
          let h = 0;
          for (const c of cr) {
            const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
            if (d2 > c.lim) continue;
            const d = Math.sqrt(d2) / c.r;
            h += d < 1 ? -c.d * (1 - d * d) : c.d * 0.35 * Math.exp(-((d - 1) / 0.28) * ((d - 1) / 0.28));
          }
          return h;
        };
      }
      case 'const':
        return () => amp;
      default:
        return () => 0;
    }
  });
  return (x, z) => {
    let h = 0;
    for (const p of parts) h += p(x, z);
    return h;
  };
}

export function colorFunction(t: Terrain | undefined): ColorFn {
  const base = new THREE.Color(t?.colors?.base ?? '#c8a874');
  const layers = (t?.colors?.layers ?? []).map((L: ColorLayer) => {
    const col = new THREE.Color(L.color), m = maskFn(L.masks);
    if (L.type === 'fbm') {
      const f = L.freq ?? 0.01, ox = L.offset?.[0] ?? 0, oz = L.offset?.[1] ?? 0, lo = L.lo ?? 0, g = L.gain ?? 1, mx = L.max ?? 1;
      return (x: number, z: number, c: THREE.Color) => c.lerp(col, clamp((fbm(x * f + ox, z * f + oz) - lo) * g, 0, mx) * m(x, z));
    }
    return (x: number, z: number, c: THREE.Color) => c.lerp(col, smooth(L.from ?? 0, L.to ?? 1, coordOf(L.coord, L.center, x, z)) * (L.amount ?? 1) * m(x, z));
  });
  return (x, z, out) => {
    out.copy(base);
    for (const l of layers) l(x, z, out);
    return out;
  };
}

export interface TerrainRuntime {
  mesh: THREE.Mesh | null;
  height: HeightFn;
  color: ColorFn;
  deck: { texture: THREE.Texture; scroll: number; puffs: THREE.Points | null } | null;
  dispose(): void;
}

export function buildTerrain(t: Terrain | undefined, segScale = 1): TerrainRuntime {
  const height = heightFunction(t);
  const color = colorFunction(t);
  if (!t || t.type === 'none') return { mesh: null, height, color, deck: null, dispose() {} };
  if (t.type === 'deck') return buildDeck(t, height, color);
  const SIZE = t.size ?? 1000;
  const SEG = Math.max(16, Math.round((t.segments ?? 128) * segScale));
  const cx = t.center?.[0] ?? 0, cz = t.center?.[1] ?? 0;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, height(x, z));
    color(x, z, c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    ...(t.texture ? { map: textureFor(t.texture) } : {}),
    ...(t.bump ? { bumpMap: textureFor(t.bump), bumpScale: t.bumpScale ?? 1 } : {}),
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.userData.ground = true;
  return {
    mesh,
    height,
    color,
    deck: null,
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}

/** Gas giants: a banded cloud floor that scrolls with the wind, plus drifting puffs. */
function buildDeck(t: Terrain, height: HeightFn, color: ColorFn): TerrainRuntime {
  const canvas = makeCanvas(512, 512);
  const g2 = canvas.getContext('2d')!, img = g2.createImageData(512, 512), D = img.data;
  const cols = (t.bands ?? ['#cccccc', '#999999']).map(hexRgb), seed = t.seed ?? 1;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const tx = (x / 512) * TAU, ty = (y / 512) * TAU;
      const n = fbm3(Math.cos(tx) * 2 + seed, Math.sin(tx) * 2, Math.cos(ty) * 1.2 + Math.sin(ty) * 0.8, 3);
      const b = (Math.sin(ty * 3 + n * 5) * 0.5 + 0.5) * (cols.length - 1), i = Math.floor(b);
      const rgb = mixRgb(cols[i]!, cols[Math.min(i + 1, cols.length - 1)]!, b - i);
      const k = (y * 512 + x) * 4;
      D[k] = rgb[0];
      D[k + 1] = rgb[1];
      D[k + 2] = rgb[2];
      D[k + 3] = 255;
    }
  g2.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  const geo = new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  let puffs: THREE.Points | null = null;
  if (t.puffs) {
    const n = 520, a = new Float32Array(n * 3), r = rng(33);
    for (let i = 0; i < n; i++) {
      a[i * 3] = (r() - 0.5) * 600;
      a[i * 3 + 1] = 0.5 + r() * 12;
      a[i * 3 + 2] = (r() - 0.5) * 600;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(a, 3));
    puffs = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ map: new THREE.CanvasTexture(canvasFor({ gen: 'halo' })), size: 34, transparent: true, opacity: 0.5, depthWrite: false, color: new THREE.Color(t.puffs) }),
    );
    puffs.frustumCulled = false;
    mesh.add(puffs);
  }
  return {
    mesh,
    height,
    color,
    deck: { texture: tex, scroll: t.scroll ?? 0.004, puffs },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
