// Shared helpers for the prototype → pack port scripts. These scripts are authoring tools: they write plain
// JSON into packs/<id>/ and are kept so the port can be re-run and audited. Packs never ship this code.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
function ihash(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = ihash(xi, zi), b = ihash(xi + 1, zi), c = ihash(xi, zi + 1), d = ihash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return vnoise(x, z) * 0.57 + vnoise(x * 2.03 + 5.2, z * 2.03 - 1.7) * 0.29 + vnoise(x * 4.1 - 3.3, z * 4.1 + 8.1) * 0.14;
}
export const r2 = (n) => Math.round(n * 100) / 100;
export const r3 = (n) => Math.round(n * 1000) / 1000;

/** Collects bilingual strings: S('key', 'عربي', 'English') returns the key. */
export function strings() {
  const ar = {}, en = {};
  const S = (key, a, e) => {
    if (key in ar && (ar[key] !== a || en[key] !== e)) throw new Error(`duplicate key ${key}`);
    ar[key] = a;
    en[key] = e;
    return key;
  };
  return { S, ar, en };
}

export function writePack(dir, files) {
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, data] of Object.entries(files)) {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 1) + '\n');
  }
}
