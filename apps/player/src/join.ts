/**
 * Joining a class with a code: students under 15 pick a display name from a generated list (e.g. صقر أزرق)
 * or type one the teacher approves. No email, no phone (BRIEF §2, §10).
 */
const ADJ = [['أزرق', 'Blue'], ['دهبي', 'Golden'], ['شجاع', 'Brave'], ['سريع', 'Swift'], ['هادي', 'Calm'], ['ذكي', 'Clever']];
const NOUN = [['صقر', 'Falcon'], ['جمل', 'Camel'], ['نجم', 'Star'], ['نخلة', 'Palm'], ['هلال', 'Crescent'], ['قمر', 'Moon']];

export function suggestNames(n = 6, ar = true): string[] {
  const out = new Set<string>();
  while (out.size < n) {
    const a = ADJ[Math.floor(Math.random() * ADJ.length)]!, b = NOUN[Math.floor(Math.random() * NOUN.length)]!;
    out.add(ar ? `${b[0]} ${a[0]}` : `${a[1]} ${b[1]}`);
  }
  return [...out];
}

export function pickName(host: HTMLElement, policy: 'list' | 'typed', locale: string, suggestions: string[]): Promise<string> {
  const ar = locale.startsWith('ar');
  const names = suggestions.length ? suggestions : suggestNames(6, ar);
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('style', 'position:fixed;inset:0;display:grid;place-items:center;background:#0c1530;color:#f6ead0;padding:20px;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif');
    wrap.dir = ar ? 'rtl' : 'ltr';
    const card = document.createElement('div');
    card.setAttribute('style', 'max-width:420px;width:100%;text-align:center');
    const h = document.createElement('h1');
    h.textContent = ar ? 'اختار اسمك في الفصل' : 'Pick your class name';
    h.setAttribute('style', 'color:#f6d58a;font-size:26px');
    card.append(h);
    const grid = document.createElement('div');
    grid.setAttribute('style', 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px');
    for (const n of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      b.setAttribute('style', 'min-height:48px;border-radius:14px;border:1px solid rgba(240,206,140,.4);background:rgba(244,231,201,.08);color:inherit;font:inherit;font-size:17px;cursor:pointer');
      b.addEventListener('click', () => {
        wrap.remove();
        resolve(n);
      });
      grid.append(b);
    }
    card.append(grid);
    if (policy === 'typed') {
      const f = document.createElement('form');
      f.setAttribute('style', 'margin-top:14px;display:flex;gap:8px');
      const i = document.createElement('input');
      i.maxLength = 16;
      i.placeholder = ar ? 'أو اكتب اسمك (المدرس هيوافق عليه)' : 'or type your name (your teacher approves it)';
      i.setAttribute('style', 'flex:1;min-height:44px;border-radius:12px;border:1px solid rgba(240,206,140,.4);background:rgba(244,231,201,.08);color:inherit;padding:0 12px;font:inherit');
      const s = document.createElement('button');
      s.type = 'submit';
      s.textContent = ar ? 'تمام' : 'OK';
      s.setAttribute('style', 'min-height:44px;border-radius:12px;border:0;background:#e9b44c;color:#2b1c04;font:inherit;font-weight:600;padding:0 16px');
      f.append(i, s);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = i.value.trim().slice(0, 16);
        if (!v) return;
        wrap.remove();
        resolve(v);
      });
      card.append(f);
    }
    wrap.append(card);
    host.append(wrap);
  });
}
