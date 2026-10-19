/**
 * Display names for students (BRIEF §10): picked from a generated list, or typed and approved by the teacher.
 * The word filter covers Arabic, Franco-Arabic and English. The list here is a minimal seed; the content team
 * maintains the full list (docs/OPEN-QUESTIONS.md).
 */
const ADJ = [['أزرق', 'Blue'], ['دهبي', 'Golden'], ['شجاع', 'Brave'], ['سريع', 'Swift'], ['هادي', 'Calm'], ['ذكي', 'Clever'], ['منوّر', 'Bright'], ['أخضر', 'Green']];
const NOUN = [['صقر', 'Falcon'], ['جمل', 'Camel'], ['نجم', 'Star'], ['نخلة', 'Palm'], ['هلال', 'Crescent'], ['قمر', 'Moon'], ['نسر', 'Eagle'], ['لوتس', 'Lotus']];

export function suggestNames(n: number, locale: string, taken: Set<string> = new Set()): string[] {
  const ar = locale.startsWith('ar');
  const out: string[] = [];
  const all: string[] = [];
  for (const a of ADJ) for (const b of NOUN) all.push(ar ? `${b[0]} ${a[0]}` : `${a[1]} ${b[1]}`);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  for (const s of all) {
    if (out.length >= n) break;
    if (!taken.has(s)) out.push(s);
  }
  return out;
}

export function isSuggestedName(name: string): boolean {
  for (const a of ADJ) for (const b of NOUN) if (name === `${b[0]} ${a[0]}` || name === `${a[1]} ${b[1]}`) return true;
  return false;
}

const BLOCK = ['fuck', 'shit', 'bitch', 'sex', 'porn', 'kos', 'koss', 'a7a', 'sharmoot', 'metnak', 'zeby', 'خول', 'شرموط', 'متناك', 'كس', 'زبي', 'احا', 'خرا', 'سكس'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', $: 's' };

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

/** The stored form: NFKC, no invisible or bidi control characters, single spaces. */
export function normalizeName(s: string): string {
  return s.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** The compared form for the word filter: also drops harakat and tatweel and folds letter variants. */
function foldName(s: string): string {
  return normalizeName(s)
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function nameProblem(raw: string): string | null {
  const n = foldName(raw);
  if (n.length < 2) return 'too-short';
  if (n.length > 16) return 'too-long';
  if (/https?:|www\.|@|\d{5,}/i.test(n)) return 'contact-info';
  const flat = n.toLowerCase().replace(/[0-9@$]/g, (c) => LEET[c] ?? c).replace(/(.)\1+/g, '$1').replace(/[\s._-]/g, '');
  if (BLOCK.some((w) => flat.includes(w))) return 'blocked-word';
  return null;
}
