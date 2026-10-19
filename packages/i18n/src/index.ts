/**
 * Locale helpers for Rihla: a small ICU MessageFormat subset (arguments, number, plural with #, select),
 * numerals by locale (Eastern Arabic ١٢٣ or Western 123, never mixed in one number), direction and lists.
 * No dependencies so the player's landing shell stays tiny.
 */

export type Numerals = 'arab' | 'latn';
export type Params = Record<string, string | number | undefined | null>;
export type Strings = Record<string, string>;

const RTL = /^(ar|he|fa|ur|ps|yi)(-|$)/i;
export const isRtl = (locale: string) => RTL.test(locale);
export const dirOf = (locale: string): 'rtl' | 'ltr' => (isRtl(locale) ? 'rtl' : 'ltr');
export const langOf = (locale: string) => locale.split('-')[0] ?? locale;

/** Default numerals: Egyptian Arabic uses Eastern Arabic digits; Gulf overlays may pick either. */
export function defaultNumerals(locale: string): Numerals {
  return /^ar(-EG)?$/i.test(locale) ? 'arab' : 'latn';
}

const nfCache = new Map<string, Intl.NumberFormat>();
export function formatNumber(n: number, locale: string, numerals: Numerals = defaultNumerals(locale), opts: Intl.NumberFormatOptions = {}): string {
  const key = `${locale}|${numerals}|${JSON.stringify(opts)}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(`${locale}-u-nu-${numerals}`, { maximumFractionDigits: 2, ...opts });
    nfCache.set(key, nf);
  }
  return nf.format(n);
}

/** Arabic text uses the Arabic comma (،) between list items. */
export function formatList(items: string[], locale: string): string {
  if (isRtl(locale)) return items.join('، ');
  return items.join(', ');
}

/* ---------------------------------------------------------------- ICU subset */

type Node =
  | { t: 'text'; v: string }
  | { t: 'arg'; name: string; format?: 'number' }
  | { t: 'hash' }
  | { t: 'plural'; name: string; offset: number; cases: Record<string, Node[]> }
  | { t: 'select'; name: string; cases: Record<string, Node[]> };

const parseCache = new Map<string, Node[]>();

export function parse(src: string): Node[] {
  const cached = parseCache.get(src);
  if (cached) return cached;
  let i = 0;
  const parseNodes = (inPlural: boolean, stop: boolean): Node[] => {
    const out: Node[] = [];
    let text = '';
    const flush = () => {
      if (text) out.push({ t: 'text', v: text });
      text = '';
    };
    while (i < src.length) {
      const c = src[i]!;
      if (c === "'") {
        // ICU quoting: '' → ', '{...}' → literal
        if (src[i + 1] === "'") {
          text += "'";
          i += 2;
          continue;
        }
        if (src[i + 1] === '{' || src[i + 1] === '}' || src[i + 1] === '#') {
          const end = src.indexOf("'", i + 1);
          text += src.slice(i + 1, end < 0 ? src.length : end);
          i = end < 0 ? src.length : end + 1;
          continue;
        }
        text += c;
        i++;
        continue;
      }
      if (c === '}' && stop) break;
      if (c === '#' && inPlural) {
        flush();
        out.push({ t: 'hash' });
        i++;
        continue;
      }
      if (c === '{') {
        flush();
        i++;
        out.push(parseArg());
        continue;
      }
      text += c;
      i++;
    }
    flush();
    return out;
  };
  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const word = () => {
    skipWs();
    const start = i;
    while (i < src.length && /[^\s,{}]/.test(src[i]!)) i++;
    return src.slice(start, i);
  };
  const parseArg = (): Node => {
    const name = word();
    skipWs();
    if (src[i] === '}') {
      i++;
      return { t: 'arg', name };
    }
    if (src[i] !== ',') throw new Error(`ICU: expected , after ${name} in "${src}"`);
    i++;
    const type = word();
    skipWs();
    if (type === 'number') {
      if (src[i] === ',') {
        // style ignored
        while (i < src.length && src[i] !== '}') i++;
      }
      i++;
      return { t: 'arg', name, format: 'number' };
    }
    if (type !== 'plural' && type !== 'select' && type !== 'selectordinal') throw new Error(`ICU: unsupported type ${type}`);
    if (src[i] === ',') i++;
    const cases: Record<string, Node[]> = {};
    let offset = 0;
    for (;;) {
      skipWs();
      if (src[i] === '}') {
        i++;
        break;
      }
      let sel = word();
      if (sel.startsWith('offset:')) {
        offset = Number(sel.slice(7)) || 0;
        continue;
      }
      skipWs();
      if (src[i] !== '{') throw new Error(`ICU: expected { after case ${sel}`);
      i++;
      cases[sel] = parseNodes(type !== 'select', true);
      i++; // closing }
      sel = '';
    }
    return type === 'select' ? { t: 'select', name, cases } : { t: 'plural', name, offset, cases };
  };
  const nodes = parseNodes(false, false);
  parseCache.set(src, nodes);
  return nodes;
}

const prCache = new Map<string, Intl.PluralRules>();
function pluralCategory(n: number, locale: string): string {
  let pr = prCache.get(locale);
  if (!pr) {
    pr = new Intl.PluralRules(locale);
    prCache.set(locale, pr);
  }
  return pr.select(n);
}

export interface FormatOptions {
  locale: string;
  numerals?: Numerals;
}

export function format(src: string, params: Params = {}, opts: FormatOptions): string {
  const numerals = opts.numerals ?? defaultNumerals(opts.locale);
  const fmtValue = (v: unknown): string => {
    if (typeof v === 'number') return formatNumber(v, opts.locale, numerals);
    if (v == null) return '';
    return String(v);
  };
  const render = (nodes: Node[], hashValue?: number): string => {
    let s = '';
    for (const n of nodes) {
      switch (n.t) {
        case 'text':
          s += n.v;
          break;
        case 'hash':
          s += hashValue === undefined ? '#' : formatNumber(hashValue, opts.locale, numerals);
          break;
        case 'arg':
          s += fmtValue(params[n.name]);
          break;
        case 'plural': {
          const raw = Number(params[n.name] ?? 0);
          const v = raw - n.offset;
          const exact = n.cases[`=${raw}`];
          const branch = exact ?? n.cases[pluralCategory(v, opts.locale)] ?? n.cases.other ?? [];
          s += render(branch, v);
          break;
        }
        case 'select': {
          const key = String(params[n.name] ?? 'other');
          s += render(n.cases[key] ?? n.cases.other ?? [], hashValue);
          break;
        }
      }
    }
    return s;
  };
  try {
    return render(parse(src));
  } catch {
    return src;
  }
}

/* ---------------------------------------------------------------- translator */

export interface Translator {
  locale: string;
  dir: 'rtl' | 'ltr';
  numerals: Numerals;
  t: (key: string, params?: Params) => string;
  has: (key: string) => boolean;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  list: (items: string[]) => string;
}

/**
 * Lookup order: each table in `tables` (pack overlay → pack locale → engine locale), then the same chain
 * for `fallbackTables`. A missing key renders as the key itself and is reported once.
 */
export function createTranslator(
  locale: string,
  tables: Strings[],
  opts: { numerals?: Numerals; fallbackTables?: Strings[]; onMissing?: (key: string) => void } = {},
): Translator {
  const numerals = opts.numerals ?? defaultNumerals(locale);
  const reported = new Set<string>();
  const lookup = (key: string): string | undefined => {
    for (const t of tables) if (key in t) return t[key];
    for (const t of opts.fallbackTables ?? []) if (key in t) return t[key];
    return undefined;
  };
  return {
    locale,
    dir: dirOf(locale),
    numerals,
    t: (key, params) => {
      const src = lookup(key);
      if (src === undefined) {
        if (!reported.has(key)) {
          reported.add(key);
          opts.onMissing?.(key);
        }
        return key;
      }
      return params ? format(src, params, { locale, numerals }) : src.includes('{') ? format(src, {}, { locale, numerals }) : src;
    },
    has: (key) => lookup(key) !== undefined,
    num: (n, o) => formatNumber(n, locale, numerals, o),
    list: (items) => formatList(items, locale),
  };
}
