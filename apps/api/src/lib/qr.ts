import QRCode from 'qrcode';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One QR symbol as an SVG path in module units (size × size), quiet zone excluded. */
export function qrPath(text: string): { d: string; size: number } {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, data = q.modules.data;
  let d = '';
  for (let y = 0; y < n; y++) {
    let run = -1;
    for (let x = 0; x <= n; x++) {
      const on = x < n && data[y * n + x];
      if (on && run < 0) run = x;
      if (!on && run >= 0) {
        d += `M${run} ${y}h${x - run}v1h${run - x}z`;
        run = -1;
      }
    }
  }
  return { d, size: n };
}

/** A single code with the short URL printed underneath (what goes next to the lesson). */
export function qrSvg(url: string, label: string, caption = ''): string {
  const { d, size } = qrPath(url);
  const pad = 4, W = size + pad * 2, H = W + 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 6}" height="${H * 6}"><rect width="${W}" height="${H}" fill="#fff"/><path transform="translate(${pad} ${pad})" d="${d}" fill="#000"/><text x="${W / 2}" y="${W + 3}" font-family="IBM Plex Sans Arabic, Arial, sans-serif" font-size="3.2" text-anchor="middle">${esc(label)}</text>${caption ? `<text x="${W / 2}" y="${W + 7}" font-family="IBM Plex Sans Arabic, Arial, sans-serif" font-size="2.6" text-anchor="middle" direction="rtl">${esc(caption)}</text>` : ''}</svg>`;
}

/** A4 print sheet (mm units): a grid of codes, each with its short URL and page caption. */
export function sheetSvg(codes: { url: string; label: string; caption: string }[], cols = 4): string {
  const W = 210, H = 297, margin = 12, cell = (W - margin * 2) / cols, rows = Math.floor((H - margin * 2) / (cell + 10));
  const pages: string[] = [];
  for (let start = 0; start < codes.length; start += cols * rows) {
    let body = '';
    codes.slice(start, start + cols * rows).forEach((c, i) => {
      const cx = margin + (i % cols) * cell, cy = margin + Math.floor(i / cols) * (cell + 10);
      const { d, size } = qrPath(c.url);
      const s = (cell - 8) / size;
      body += `<g transform="translate(${cx + 4} ${cy + 2})"><path transform="scale(${s.toFixed(4)})" d="${d}"/></g>`;
      body += `<text x="${cx + cell / 2}" y="${cy + cell + 1}" font-size="3.4" text-anchor="middle">${esc(c.label)}</text>`;
      body += `<text x="${cx + cell / 2}" y="${cy + cell + 5.5}" font-size="2.8" text-anchor="middle" direction="rtl">${esc(c.caption)}</text>`;
    });
    pages.push(body);
  }
  // multiple A4 pages stacked vertically; print with "fit to page height" or split per page
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H * pages.length}" width="${W}mm" height="${H * pages.length}mm" font-family="IBM Plex Sans Arabic, Arial, sans-serif">${pages
    .map((p, i) => `<g transform="translate(0 ${i * H})"><rect width="${W}" height="${H}" fill="#fff"/>${p}</g>`)
    .join('')}</svg>`;
}

export async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 4, scale: 10 });
}
