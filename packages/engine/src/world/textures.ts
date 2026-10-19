import * as THREE from 'three';
import type { TextureRef } from '@rihla/pack-schema';
import { TAU, clamp, fbm3, hexRgb, ihash, mixRgb, rng, smooth, type RGB } from '../math/noise.js';

/**
 * Procedural canvas textures. Each generator is generic (a pack picks it and its parameters); the defaults
 * reproduce the prototypes exactly. Canvases are cached by (gen, seed, size, colors, params); textures are
 * cached per repeat so materials can share GPU memory.
 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

type Gen = (seed: number, size: number, colors: string[] | undefined, params: Record<string, unknown>) => HTMLCanvasElement;

const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d')!;

const GENS: Record<string, Gen> = {
  sand(seed = 7, size = 256, colors) {
    const c = makeCanvas(size, size), g = ctx2d(c), r = rng(seed);
    g.fillStyle = colors?.[0] ?? '#ede1c9';
    g.fillRect(0, 0, size, size);
    const n = Math.round(5200 * (size / 256) ** 2);
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(150,110,60,${0.05 + r() * 0.12})` : `rgba(255,250,235,${0.05 + r() * 0.15})`;
      g.fillRect(r() * size, r() * size, 1 + r() * 1.6, 1 + r() * 1.6);
    }
    return c;
  },
  ripple(_seed, size = 256) {
    const c = makeCanvas(size, size), g = ctx2d(c), img = g.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const w = Math.sin((x / size) * TAU * 2) * 7 + Math.sin((y / size) * TAU * 3 + 1) * 4 + Math.sin(((x + y) / size) * TAU) * 5;
        const v = 0.5 + 0.5 * Math.sin(((y + w) / size) * TAU * 9);
        const val = clamp(v * 0.8 + ihash(x, y) * 0.2, 0, 1) * 255;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  },
  stone(seed = 11, size = 256, colors, p) {
    const c = makeCanvas(size, size), g = ctx2d(c), r = rng(seed);
    const simple = p.variant === 'simple';
    const [br, bg, bb] = hexRgb(colors?.[0] ?? '#d4b486');
    g.fillStyle = '#d2b487';
    g.fillRect(0, 0, 256, 256);
    const rh = 32;
    for (let row = 0; row < 8; row++) {
      let x = -r() * 40;
      while (x < 256) {
        const w = simple ? 26 + r() * 44 : 22 + r() * 40, l = simple ? 0.86 + r() * 0.22 : 0.84 + r() * 0.26;
        g.fillStyle = `rgb(${Math.round((simple ? 210 : br) * l)},${Math.round((simple ? 178 : bg) * l)},${Math.round((simple ? 132 : bb) * l)})`;
        g.fillRect(x, row * rh, w, rh);
        if (!simple) {
          if (x + w > 256) g.fillRect(x - 256, row * rh, w, rh);
          if (x < 0) g.fillRect(x + 256, row * rh, w, rh);
        }
        g.fillStyle = simple ? 'rgba(70,48,25,0.55)' : 'rgba(70,48,25,0.6)';
        g.fillRect(x, row * rh, 2, rh);
        if (!simple && r() < 0.35) {
          g.fillStyle = 'rgba(60,40,20,0.22)';
          g.beginPath();
          g.ellipse(x + w * r(), row * rh + rh * r(), 3 + r() * 6, 2 + r() * 3, 0, 0, TAU);
          g.fill();
        }
        x += w;
      }
      g.fillStyle = 'rgba(60,40,20,0.65)';
      g.fillRect(0, row * rh, 256, 3);
      if (!simple) {
        g.fillStyle = 'rgba(255,240,210,0.25)';
        g.fillRect(0, row * rh + 3, 256, 2);
        g.fillStyle = 'rgba(50,32,15,0.25)';
        g.fillRect(0, row * rh + rh - 5, 256, 5);
      }
    }
    if (!simple)
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(90,64,36,${r() * 0.18})`;
        g.beginPath();
        g.arc(r() * 256, r() * 256, r() * 2.6, 0, TAU);
        g.fill();
      }
    return c;
  },
  casing(seed = 13) {
    const c = makeCanvas(256, 256), g = ctx2d(c), r = rng(seed);
    g.fillStyle = '#ead9b8';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = r() * 256, y = r() * 256, rad = 10 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const d = r() < 0.5;
      gr.addColorStop(0, d ? 'rgba(150,115,70,0.22)' : 'rgba(255,248,230,0.3)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.strokeStyle = 'rgba(120,90,55,0.2)';
    g.lineWidth = 1;
    for (let y = 0; y < 256; y += 32) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(256, y + 0.5);
      g.stroke();
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(110,85,55,${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 1, 1);
    }
    return c;
  },
  granite(seed = 17) {
    const c = makeCanvas(128, 128), g = ctx2d(c), r = rng(seed);
    g.fillStyle = '#9d6a58';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      const k = r();
      g.fillStyle = k < 0.4 ? 'rgba(40,30,30,0.5)' : k < 0.7 ? 'rgba(230,200,190,0.45)' : 'rgba(170,90,70,0.5)';
      g.fillRect(r() * 128, r() * 128, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    return c;
  },
  strata(seed = 5) {
    const c = makeCanvas(128, 256), g = ctx2d(c), r = rng(seed);
    let y = 0;
    while (y < 256) {
      const h = 6 + r() * 20, l = 0.82 + r() * 0.25;
      g.fillStyle = `rgb(${Math.round(206 * l)},${Math.round(170 * l)},${Math.round(120 * l)})`;
      g.fillRect(0, y, 128, h);
      g.fillStyle = 'rgba(80,55,30,0.35)';
      g.fillRect(0, y, 128, 1.5);
      y += h;
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(70,50,30,${r() * 0.2})`;
      g.fillRect(r() * 128, r() * 256, 1 + r() * 3, 1 + r() * 2);
    }
    return c;
  },
  facade(seed = 23) {
    return facadePair(seed)[0];
  },
  'facade-windows'(seed = 23) {
    return facadePair(seed)[1];
  },
  'tiles-triangles'(seed = 91) {
    const c = makeCanvas(256, 128), g = ctx2d(c), r = rng(seed);
    g.fillStyle = '#e9e2d2';
    g.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 16)
      for (let x = -16; x < 256; x += 16) {
        const up = (x / 16 + y / 16) % 2 === 0;
        g.fillStyle = `rgba(${(190 + r() * 50) | 0},${(180 + r() * 45) | 0},${(160 + r() * 40) | 0},0.9)`;
        g.beginPath();
        if (up) {
          g.moveTo(x, y + 16);
          g.lineTo(x + 8, y);
          g.lineTo(x + 16, y + 16);
        } else {
          g.moveTo(x, y);
          g.lineTo(x + 16, y);
          g.lineTo(x + 8, y + 16);
        }
        g.closePath();
        g.fill();
      }
    return c;
  },
  'papyrus-art'(seed = 9, _s, _c, p) {
    const c = makeCanvas(256, 192), g = ctx2d(c), r = rng(seed);
    g.fillStyle = '#e6d2a0';
    g.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 180; i++) {
      g.fillStyle = `rgba(150,115,60,${0.08 + r() * 0.12})`;
      g.fillRect(0, r() * 192, 256, 1);
      g.fillRect(r() * 256, 0, 1, 192);
    }
    g.strokeStyle = '#7a5228';
    g.lineWidth = 3;
    g.strokeRect(10, 10, 236, 172);
    g.fillStyle = '#2b6cb0';
    g.beginPath();
    g.arc(70, 96, 30, 0, TAU);
    g.fill();
    g.fillStyle = '#e9b44c';
    g.fillRect(120, 40, 100, 110);
    g.fillStyle = '#3b2a14';
    g.font = '48px "Noto Sans Egyptian Hieroglyphs", serif';
    g.textAlign = 'center';
    const glyphs = typeof p.glyphs === 'string' ? p.glyphs : String.fromCodePoint(0x13153, 0x13216);
    g.fillText(glyphs, 170, 110);
    g.fillStyle = '#c4533c';
    g.beginPath();
    g.moveTo(40, 170);
    g.lineTo(70, 130);
    g.lineTo(100, 170);
    g.fill();
    return c;
  },
  wicker() {
    const c = makeCanvas(64, 64), g = ctx2d(c);
    g.fillStyle = '#8a5a2b';
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8)
      for (let x = 0; x < 64; x += 8) {
        g.fillStyle = ((x + y) / 8) % 2 ? '#a8743c' : '#6f4520';
        g.fillRect(x + 1, y + 1, 6, 6);
      }
    return c;
  },
  'balloon-panels'(_s, _z, colors) {
    const c = makeCanvas(512, 256), g = ctx2d(c), cols = colors ?? ['#2f63b0', '#e9b44c', '#c4533c', '#239a8c'];
    for (let i = 0; i < 16; i++) {
      g.fillStyle = cols[i % cols.length]!;
      g.fillRect(i * 32, 0, 32, 256);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(i * 32, 0, 3, 256);
    }
    g.fillStyle = '#f1e3c6';
    g.fillRect(0, 0, 512, 22);
    g.fillRect(0, 104, 512, 40);
    for (let x = 0; x < 512; x += 32) {
      g.fillStyle = '#c4533c';
      g.beginPath();
      g.moveTo(x, 144);
      g.lineTo(x + 8, 108);
      g.lineTo(x + 16, 144);
      g.fill();
      g.fillStyle = '#2f63b0';
      g.beginPath();
      g.moveTo(x + 16, 144);
      g.lineTo(x + 24, 108);
      g.lineTo(x + 32, 144);
      g.fill();
      g.fillStyle = '#e8b54b';
      g.beginPath();
      g.moveTo(x + 8, 108);
      g.lineTo(x + 16, 144);
      g.lineTo(x + 24, 108);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 236, 512, 20);
    return c;
  },
  regolith(seed = 17) {
    const c = makeCanvas(256, 256), g = ctx2d(c), r = rng(seed);
    g.fillStyle = '#e6e2dc';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(60,55,50,${0.05 + r() * 0.14})` : `rgba(255,255,255,${0.05 + r() * 0.14})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    return c;
  },
  planet(_seed, size = 256, _c, p) {
    const style = String(p.style ?? 'moon');
    const W = size, H = Math.round(size / 2);
    return planetCanvas(style, W, H);
  },
  rings(seed = 4) {
    const c = makeCanvas(512, 4), g = ctx2d(c), r = rng(seed);
    for (let x = 0; x < 512; x++) {
      const k = x / 512;
      let a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(k * 90 + r() * 0.8)) * (0.7 + 0.3 * Math.sin(k * 23));
      if (k < 0.05) a *= k / 0.05;
      if (k > 0.6 && k < 0.65) a = 0.05;
      if (k > 0.95) a *= (1 - k) / 0.05;
      const l = 200 + Math.round(40 * Math.sin(k * 40));
      g.fillStyle = `rgba(${l + 20},${l},${l - 40},${a})`;
      g.fillRect(x, 0, 1, 4);
    }
    return c;
  },
  'flag-usa'() {
    const fc = makeCanvas(128, 80), fg = ctx2d(fc);
    for (let i = 0; i < 13; i++) {
      fg.fillStyle = i % 2 ? '#ffffff' : '#b22234';
      fg.fillRect(0, (i * 80) / 13, 128, 80 / 13 + 0.5);
    }
    fg.fillStyle = '#3c3b6e';
    fg.fillRect(0, 0, 56, 43);
    fg.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) fg.fillRect(4 + j * 9, 4 + i * 8, 2, 2);
    return fc;
  },
  'flag-stripes'(_s, _z, colors) {
    const c = makeCanvas(32, 48), g = ctx2d(c), cols = colors ?? ['#ce1126', '#ffffff', '#111111'];
    cols.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, (i * 48) / cols.length, 32, 48 / cols.length);
    });
    return c;
  },
  'radial-spot'() {
    const c = makeCanvas(256, 256), gg = ctx2d(c), gr = gg.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(8,16,60,0.95)');
    gr.addColorStop(0.6, 'rgba(16,30,100,0.7)');
    gr.addColorStop(1, 'rgba(30,60,160,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 256, 256);
    gg.strokeStyle = 'rgba(200,220,255,0.35)';
    gg.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      gg.beginPath();
      for (let a = 0; a < TAU * 2; a += 0.1) {
        const rr = 20 + a * 14 + i * 6;
        gg.lineTo(128 + Math.cos(a + i) * rr, 128 + Math.sin(a + i) * rr * 0.8);
      }
      gg.stroke();
    }
    return c;
  },
  clouds(seed = 19) {
    const c = makeCanvas(256, 128), g = ctx2d(c), r = rng(seed);
    for (let i = 0; i < 54; i++) {
      const x = 34 + r() * 188, y = 66 + (r() - 0.5) * 30 - Math.abs(x - 128) * 0.1, rad = 12 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
    return c;
  },
  halo() {
    const c = makeCanvas(128, 128), g = ctx2d(c), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  },
};

const facadeCache = new Map<number, [HTMLCanvasElement, HTMLCanvasElement]>();
function facadePair(seed: number): [HTMLCanvasElement, HTMLCanvasElement] {
  const hit = facadeCache.get(seed);
  if (hit) return hit;
  const facadeC = makeCanvas(128, 256), winC = makeCanvas(128, 256);
  const g = ctx2d(facadeC), e = ctx2d(winC), r = rng(seed);
  g.fillStyle = '#efe6d6';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(120,95,70,${r() * 0.08})`;
    g.fillRect(r() * 128, r() * 256, 2, 2);
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, 128, 256);
  for (let fl = 0; fl < 4; fl++) {
    const y0 = 24 + fl * 58;
    g.fillStyle = 'rgba(110,90,70,0.18)';
    g.fillRect(0, y0 + 50, 128, 3);
    for (let c = 0; c < 3; c++) {
      const wx = 12 + c * 40, wy = y0 + 10, ww = 22, wh = 30;
      g.fillStyle = '#2f2a26';
      g.fillRect(wx, wy, ww, wh);
      if (r() < 0.45) {
        g.fillStyle = r() < 0.5 ? '#3f6b55' : '#6b4f37';
        g.fillRect(wx - 3, wy, 5, wh);
        g.fillRect(wx + ww - 2, wy, 5, wh);
      }
      if (r() < 0.55) {
        e.fillStyle = `rgb(255,${190 + Math.round(r() * 40)},${100 + Math.round(r() * 40)})`;
        e.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      }
    }
  }
  const pair: [HTMLCanvasElement, HTMLCanvasElement] = [facadeC, winC];
  facadeCache.set(seed, pair);
  return pair;
}

/* ---------------------------------------------------------------- planets (from horus-voyage) */

const JUP = ['#efe1c6', '#c9935e', '#f4e8d0', '#a86d44', '#e3c193', '#8c5a3a', '#f1dfbd'].map(hexRgb);
const SAT = ['#f2e4c0', '#d9bf88', '#efe1bd', '#c8a970', '#e9d7aa', '#bfa268'].map(hexRgb);

export function planetCanvas(key: string, W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(W, H), g = ctx2d(c), img = g.createImageData(W, H), D = img.data;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, cl = Math.cos(lat), py = Math.sin(lat), al = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * TAU, px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      let rgb: RGB = [128, 128, 128];
      switch (key) {
        case 'sun': {
          const n = fbm3(px * 7, py * 7, pz * 7, 4);
          rgb = mixRgb([255, 110, 14], [255, 214, 110], n * 1.5 - 0.25);
          break;
        }
        case 'mercury': {
          const n = fbm3(px * 4 + 3, py * 4, pz * 4, 4);
          rgb = mixRgb([92, 87, 82], [172, 165, 157], n * 1.3 - 0.1);
          break;
        }
        case 'venus': {
          const w = fbm3(px * 2, py * 2, pz * 2, 2);
          const n = fbm3(px * 2.2 + w * 2, py * 7, pz * 2.2, 4);
          rgb = mixRgb([192, 143, 82], [243, 220, 170], n * 1.4 - 0.2);
          break;
        }
        case 'earth': {
          const n = fbm3(px * 1.8 + 7, py * 1.8, pz * 1.8, 4);
          if (al > 1.25 || (al > 1.1 && n > 0.5)) rgb = [236, 242, 246];
          else if (n > 0.54) {
            const d = fbm3(px * 3, py * 3 + 4, pz * 3, 2);
            rgb = al < 0.62 && d > 0.5 ? mixRgb([201, 166, 107], [224, 196, 140], d) : mixRgb([47, 107, 47], [111, 148, 64], (n - 0.54) * 5);
          } else rgb = mixRgb([13, 52, 116], [29, 95, 176], n * 1.9);
          break;
        }
        case 'moon': {
          const n = fbm3(px * 3 + 1, py * 3, pz * 3, 4), m = fbm3(px * 1.4 + 9, py * 1.4, pz * 1.4, 2);
          rgb = mixRgb([102, 100, 95], [189, 186, 179], n * 1.3 - 0.1);
          if (m < 0.45) rgb = mixRgb(rgb, [70, 70, 68], 0.45);
          break;
        }
        case 'mars': {
          const n = fbm3(px * 3, py * 3 + 2, pz * 3, 4), m = fbm3(px * 1.6 + 4, py * 1.6, pz * 1.6, 2);
          rgb = mixRgb([124, 56, 32], [207, 115, 66], n * 1.4 - 0.15);
          if (m < 0.42) rgb = mixRgb(rgb, [95, 45, 28], 0.5);
          if (al > 1.38) rgb = [240, 232, 226];
          break;
        }
        case 'jupiter': {
          const tb = fbm3(px * 3, py * 3, pz * 3, 3), b = (Math.sin(lat * 16 + tb * 2.4) * 0.5 + 0.5) * (JUP.length - 1), i = Math.floor(b);
          rgb = mixRgb(JUP[i]!, JUP[Math.min(i + 1, JUP.length - 1)]!, b - i);
          const dl = ((((lon - 1.2 + Math.PI) % TAU) + TAU) % TAU) - Math.PI, e = (dl / 0.32) ** 2 + ((lat + 0.38) / 0.12) ** 2;
          if (e < 1) rgb = mixRgb(rgb, [196, 87, 58], (1 - e) * 1.3);
          break;
        }
        case 'saturn': {
          const tb = fbm3(px * 2, py * 2, pz * 2, 2), b = (Math.sin(lat * 20 + tb * 0.9) * 0.5 + 0.5) * (SAT.length - 1), i = Math.floor(b);
          rgb = mixRgb(SAT[i]!, SAT[Math.min(i + 1, SAT.length - 1)]!, b - i);
          break;
        }
        case 'uranus': {
          const n = fbm3(px * 2, py * 5, pz * 2, 2);
          rgb = mixRgb([148, 214, 221], [205, 242, 243], 0.5 + 0.3 * Math.sin(lat * 5) + (n - 0.5) * 0.3);
          break;
        }
        case 'neptune': {
          const n = fbm3(px * 2.5, py * 8, pz * 2.5, 3);
          rgb = mixRgb([36, 69, 176], [90, 132, 232], 0.5 + 0.3 * Math.sin(lat * 9 + n * 3) + (n - 0.5) * 0.4);
          const dl = ((((lon - 3 + Math.PI) % TAU) + TAU) % TAU) - Math.PI, e = (dl / 0.25) ** 2 + ((lat + 0.35) / 0.1) ** 2;
          if (e < 1) rgb = mixRgb(rgb, [22, 38, 106], 1 - e);
          if (n > 0.68 && al < 0.8) rgb = mixRgb(rgb, [235, 240, 255], (n - 0.68) * 3);
          break;
        }
        case 'io': {
          const n = fbm3(px * 4, py * 4, pz * 4, 3);
          rgb = mixRgb([200, 170, 60], [240, 220, 120], n * 1.4 - 0.2);
          if (n > 0.66) rgb = [120, 60, 20];
          break;
        }
        case 'ganymede': {
          const n = fbm3(px * 3, py * 3, pz * 3, 3);
          rgb = mixRgb([90, 82, 72], [170, 160, 145], n * 1.4 - 0.2);
          break;
        }
        case 'triton': {
          const n = fbm3(px * 3, py * 3, pz * 3, 3);
          rgb = mixRgb([190, 170, 170], [235, 225, 215], n * 1.3 - 0.1);
          break;
        }
        case 'clouds': {
          const n = fbm3(px * 3 + 10, py * 3, pz * 3, 4), a = smooth(0.5, 0.7, n);
          rgb = [255, 255, 255];
          D[(y * W + x) * 4 + 3] = a * 255;
          break;
        }
      }
      const i = (y * W + x) * 4;
      D[i] = rgb[0];
      D[i + 1] = rgb[1];
      D[i + 2] = rgb[2];
      if (key !== 'clouds') D[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (key === 'mercury' || key === 'moon') {
    const r = rng(key === 'moon' ? 5 : 9);
    for (let k = 0; k < (key === 'moon' ? 80 : 120); k++) {
      const x = r() * W, y = H * 0.12 + r() * H * 0.76, rad = 1 + Math.pow(r(), 3) * W * 0.035;
      g.fillStyle = 'rgba(40,38,36,0.28)';
      g.beginPath();
      g.ellipse(x, y, rad, rad * 0.9, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(230,226,220,0.25)';
      g.lineWidth = Math.max(0.6, rad * 0.18);
      g.beginPath();
      g.ellipse(x - rad * 0.1, y - rad * 0.1, rad, rad * 0.9, 0, 0, TAU);
      g.stroke();
    }
  }
  return c;
}

/* ---------------------------------------------------------------- caches */

const canvasCache = new Map<string, HTMLCanvasElement>();
const textureCache = new Map<string, THREE.Texture>();
let maxAniso = 1;
export function setMaxAnisotropy(n: number): void {
  maxAniso = n;
}

export function canvasFor(ref: TextureRef): HTMLCanvasElement {
  const key = JSON.stringify([ref.gen, ref.seed, ref.size, ref.colors, ref.params]);
  let c = canvasCache.get(key);
  if (!c) {
    const gen = GENS[ref.gen];
    if (!gen) throw new Error(`Unknown texture generator ${ref.gen}`);
    c = gen(ref.seed as number, ref.size ?? 256, ref.colors, ref.params ?? {});
    canvasCache.set(key, c);
  }
  return c;
}

const LINEAR = new Set(['ripple', 'facade-windows']);

export function textureFor(ref: TextureRef): THREE.Texture {
  const key = JSON.stringify(ref);
  let t = textureCache.get(key);
  if (t) return t;
  const c = canvasFor(ref);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = LINEAR.has(ref.gen) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (ref.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ref.repeat[0], ref.repeat[1]);
  }
  textureCache.set(key, t);
  return t;
}

/** The vertical alpha fade used by light beams (black at the top, white at the bottom). */
let fadeTex: THREE.Texture | null = null;
export function fadeTexture(): THREE.Texture {
  if (fadeTex) return fadeTex;
  const c = makeCanvas(4, 128), g = ctx2d(c), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#000');
  gr.addColorStop(0.65, '#555');
  gr.addColorStop(1, '#fff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  fadeTex = new THREE.CanvasTexture(c);
  return fadeTex;
}
let haloTex: THREE.Texture | null = null;
export function haloTexture(): THREE.Texture {
  if (!haloTex) haloTex = new THREE.CanvasTexture(canvasFor({ gen: 'halo' }));
  return haloTex;
}

/** Re-render canvases that draw text once a web font arrives. */
export function refreshTextTextures(): void {
  for (const [key, c] of canvasCache) {
    if (key.includes('papyrus-art')) {
      const parsed = JSON.parse(key) as [string, number, number, string[] | undefined, Record<string, unknown>];
      const fresh = GENS['papyrus-art']!(parsed[1], 256, undefined, parsed[4] ?? {});
      c.getContext('2d')!.drawImage(fresh, 0, 0);
    }
  }
  for (const [k, t] of textureCache) if (k.includes('papyrus-art')) t.needsUpdate = true;
}

export function disposeTextures(): void {
  for (const t of textureCache.values()) t.dispose();
  textureCache.clear();
}
