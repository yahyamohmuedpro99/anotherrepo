/** Deterministic math shared by every generator. Ported 1:1 from the prototypes so worlds look identical. */

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export const angLerp = (a: number, b: number, k: number) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * k;
};
/** Frame-rate independent damping factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);

/** mulberry32 */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let q = Math.imul(s ^ (s >>> 15), 1 | s);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}

export function ihash(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x),
    zi = Math.floor(z),
    xf = x - xi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf),
    v = zf * zf * (3 - 2 * zf);
  const a = ihash(xi, zi),
    b = ihash(xi + 1, zi),
    c = ihash(xi, zi + 1),
    d = ihash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.57 + vnoise(x * 2.03 + 5.2, z * 2.03 - 1.7) * 0.29 + vnoise(x * 4.1 - 3.3, z * 4.1 + 8.1) * 0.14;
}

function h3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vn3(x: number, y: number, z: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z),
    xf = x - xi,
    yf = y - yi,
    zf = z - zi,
    u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf),
    w = zf * zf * (3 - 2 * zf);
  const a = h3(xi, yi, zi),
    b = h3(xi + 1, yi, zi),
    c = h3(xi, yi + 1, zi),
    d = h3(xi + 1, yi + 1, zi),
    e = h3(xi, yi, zi + 1),
    f = h3(xi + 1, yi, zi + 1),
    g = h3(xi, yi + 1, zi + 1),
    k = h3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u,
    x2 = c + (d - c) * u,
    x3 = e + (f - e) * u,
    x4 = g + (k - g) * u,
    y1 = x1 + (x2 - x1) * v,
    y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

export function fbm3(x: number, y: number, z: number, o: number): number {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < o; i++) {
    s += a * vn3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type RGB = [number, number, number];
export function hexRgb(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixRgb(a: RGB, b: RGB, k: number): RGB {
  k = clamp(k, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Characters stripped from player-entered names (control, bidi overrides, zero-width). */
const BAD_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;
export function cleanText(s: unknown, max = 16): string {
  return String(s ?? '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(BAD_CHARS, '')
    .trim()
    .slice(0, max);
}
