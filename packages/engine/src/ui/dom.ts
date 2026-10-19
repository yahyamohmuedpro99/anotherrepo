/** Tiny DOM builder. Text always goes through textContent (never innerHTML) unless it is our own markup. */
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'hidden') el.hidden = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Limited markup for hint lines: only <b>…</b> is honoured, everything else is text. */
export function setRich(el: HTMLElement, s: string): void {
  clear(el);
  const parts = s.split(/(<b>.*?<\/b>)/g);
  for (const p of parts) {
    const m = /^<b>(.*)<\/b>$/.exec(p);
    if (m) el.append(h('b', { text: m[1] }));
    else if (p) el.append(document.createTextNode(p));
  }
}
