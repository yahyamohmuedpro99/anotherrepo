export type Route = { kind: 'index' } | { kind: 'play'; packId: string | null; poiId: string | null; code: string | null };

const SAFE = /^[a-z0-9][a-z0-9._:-]{0,79}$/;

/** /x/{pack}/{poi}  ·  /play/{pack}  ·  /c/{code}  ·  / */
export function resolveRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const safe = (s: string | undefined) => (s && SAFE.test(s) ? s : null);
  if (parts[0] === 'x') return { kind: 'play', packId: safe(parts[1]), poiId: safe(parts[2]), code: null };
  if (parts[0] === 'play') return { kind: 'play', packId: safe(parts[1]), poiId: null, code: null };
  if (parts[0] === 'c' && parts[1]) return { kind: 'play', packId: null, poiId: null, code: parts[1].slice(0, 32) };
  return { kind: 'index' };
}
