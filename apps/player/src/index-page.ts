/** Local index of packs (development and pilot kiosks). Production links come from the portal. */
const PACKS = [
  { id: 'giza-plateau', ar: 'أبو الهول سكت', en: 'The Silent Sphinx', sub: ['هضبة الجيزة · دراسات اجتماعية', 'Giza Plateau · Social studies'], poi: 'poi.khufu' },
  { id: 'solar-system', ar: 'رحلة حورس', en: 'Horus Voyage', sub: ['المجموعة الشمسية · علوم', 'Solar system · Science'], poi: 'poi.mars' },
];

export function renderIndex(host: HTMLElement): void {
  document.documentElement.dir = 'rtl';
  const wrap = document.createElement('main');
  wrap.setAttribute('style', 'position:fixed;inset:0;overflow:auto;padding:24px 16px;background:radial-gradient(circle at 50% 0,#1d2c5c,#0c1530 70%);color:#f6ead0;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif');
  const h = document.createElement('h1');
  h.textContent = 'رحلة · Rihla';
  h.setAttribute('style', 'text-align:center;color:#f6d58a;font-size:34px;margin:8px 0 20px');
  wrap.append(h);
  for (const p of PACKS) {
    const card = document.createElement('section');
    card.setAttribute('style', 'max-width:560px;margin:0 auto 14px;padding:16px 18px;border-radius:18px;border:1px solid rgba(240,206,140,.26);background:rgba(11,19,40,.8)');
    const t = document.createElement('h2');
    t.textContent = `${p.ar} · ${p.en}`;
    t.setAttribute('style', 'margin:0;color:#f6d58a;font-size:22px');
    const s = document.createElement('p');
    s.textContent = `${p.sub[0]} · ${p.sub[1]}`;
    s.setAttribute('style', 'margin:6px 0 12px;opacity:.85');
    const row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap');
    const link = (href: string, text: string, gold = false) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      a.setAttribute('style', `display:inline-flex;align-items:center;min-height:42px;padding:0 16px;border-radius:999px;text-decoration:none;font-weight:600;${gold ? 'background:#e9b44c;color:#2b1c04' : 'border:1px solid rgba(240,206,140,.4);color:#f6ead0'}`);
      return a;
    };
    row.append(link(`/play/${p.id}`, 'العب · Play', true), link(`/x/${p.id}/${p.poi}`, 'QR · نموذج كود'), link(`/play/${p.id}?mode=2d`, 'كروت · Cards'), link(`/play/${p.id}?lang=en`, 'English'));
    card.append(t, s, row);
    wrap.append(card);
  }
  host.append(wrap);
}
