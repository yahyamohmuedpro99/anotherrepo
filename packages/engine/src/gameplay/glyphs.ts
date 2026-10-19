import type { GlyphAlphabet } from '@rihla/pack-schema';
import { rng, hashStr } from '../math/noise.js';

/**
 * Playful transliteration of a name into signs of a writing system (the pack supplies the alphabet: Latin
 * letters, digraphs and Arabic letters → sign names → code points). Approximate on purpose; the pack's note
 * says so to the player.
 */
export function transliterate(name: string, a: GlyphAlphabet): string[] {
  const s = String(name || '').toLowerCase(), out: string[] = [];
  const collapse = new Set(a.collapseRepeats);
  for (let i = 0; i < s.length && out.length < a.max; i++) {
    const two = s.slice(i, i + 2);
    if (a.digraphs[two]) {
      out.push(a.digraphs[two]!);
      i++;
      continue;
    }
    const c = s[i]!;
    const g = a.latin[c] ?? a.arabic[c];
    if (!g) continue;
    if (Array.isArray(g)) out.push(...g);
    else {
      if (out.length && out[out.length - 1] === g && collapse.has(c)) continue;
      out.push(g);
    }
  }
  return out.slice(0, a.max);
}

/** Draws the name inside a cartouche on papyrus. Returns the canvas and the legend of signs used. */
export function drawCartouche(name: string, a: GlyphAlphabet, footer: string, uiRtl: boolean): { canvas: HTMLCanvasElement; legend: [string, string][] } | null {
  const keys = transliterate(name, a);
  if (!keys.length) return null;
  const text = keys.map((k) => String.fromCodePoint(a.signs[k] ?? 0x13000)).join('');
  const W = 720, H = 320, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!, r = rng(hashStr(name));
  g.fillStyle = '#e7d3a3';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(150,112,58,${0.05 + r() * 0.1})`;
    g.fillRect(0, r() * H, W, 1 + r());
    g.fillRect(r() * W, 0, 1, H);
  }
  g.font = `64px "${a.font}", "Segoe UI Historic", serif`;
  g.direction = 'ltr';
  const tw = Math.max(160, g.measureText(text).width), cw = Math.min(600, tw + 96), ch = 132, x0 = (W - cw) / 2 - 10, y0 = 46;
  const rr = (x: number, y: number, w: number, hh: number, rad: number) => {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.lineTo(x + w - rad, y);
    g.arc(x + w - rad, y + rad, rad, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + rad, y + hh);
    g.arc(x + rad, y + rad, rad, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
  };
  g.fillStyle = 'rgba(255,246,220,0.55)';
  rr(x0, y0, cw, ch, ch / 2);
  g.fill();
  g.strokeStyle = '#6b4423';
  g.lineWidth = 8;
  rr(x0, y0, cw, ch, ch / 2);
  g.stroke();
  g.lineWidth = 2.5;
  rr(x0 + 11, y0 + 11, cw - 22, ch - 22, (ch - 22) / 2);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(x0 + cw + 16, y0 + 8);
  g.lineTo(x0 + cw + 16, y0 + ch - 8);
  g.stroke();
  g.fillStyle = '#2b1c0a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.beginPath();
  rr(x0 + 14, y0 + 14, cw - 28, ch - 28, (ch - 28) / 2);
  g.clip();
  const scale = Math.min(1, (cw - 70) / tw);
  g.translate(x0 + cw / 2, y0 + ch / 2 + 2);
  g.scale(scale, scale);
  g.fillText(text, 0, 0);
  g.restore();
  g.fillStyle = '#6b4423';
  g.font = '700 38px "Aref Ruqaa", "Reem Kufi", Tahoma, serif';
  g.direction = /[؀-ۿ]/.test(name) ? 'rtl' : 'ltr';
  g.fillText(name, W / 2, y0 + ch + 56);
  g.font = '500 16px "Reem Kufi", Tahoma, sans-serif';
  g.fillStyle = 'rgba(107,68,35,0.75)';
  g.direction = uiRtl ? 'rtl' : 'ltr';
  g.fillText(footer, W / 2, H - 22);
  const seen = new Set<string>(), legend: [string, string][] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    legend.push([String.fromCodePoint(a.signs[k] ?? 0x13000), a.sounds[k] ?? '']);
  }
  return { canvas: c, legend };
}
