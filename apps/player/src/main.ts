/**
 * Rihla player: QR landing (/x/{pack}/{poi}?c={code}), full play (/play/{pack}) and a tiny local index.
 * The shell paints immediately (inline CSS in index.html); the engine is a separate chunk loaded right away
 * in parallel with the pack, so a phone on 4G reaches first interaction fast (BRIEF §7, §12).
 */
import { resolveRoute, type Route } from './route.js';
import { packUrlFor, preloadTitle } from './packs.js';
import { resolveCode, joinClass, type JoinResult } from './api.js';
import { pickName } from './join.js';
import { registerSW } from './sw-register.js';

const app = document.getElementById('app')!;
const shell = document.getElementById('shell')!;
const params = new URLSearchParams(location.search);
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

function setShell(title: string | null, sub?: string): void {
  // the shell is gone once the engine (or the class name picker) took over
  const t = document.getElementById('shell-title'), s = document.getElementById('shell-sub');
  if (title && t) t.textContent = title;
  if (sub && s) s.textContent = sub;
}

async function start(route: Route): Promise<void> {
  if (route.kind === 'index') {
    const { renderIndex } = await import('./index-page.js');
    shell.remove();
    renderIndex(app);
    return;
  }
  const locale = params.get('lang') ?? localStorage.getItem('rihla.locale') ?? undefined;
  // Fonts are self-hosted (no runtime font CDN for students) and load in parallel with the engine.
  const fonts = import('./fonts.js');
  const enginePromise = import('@rihla/engine');
  let packId = route.packId;
  let poi = route.poiId;
  let join: JoinResult | null = null;
  // A printed code decides the destination at scan time, so codes never break (BRIEF §7).
  const code = params.get('c') ?? route.code;
  if (code) {
    const r = await resolveCode(API, code).catch(() => null);
    if (r?.packId) {
      packId = r.packId;
      poi = r.poiId ?? poi;
    }
    if (r?.type === 'class') {
      shell.remove();
      const name = await pickName(app, r.namePolicy ?? 'list', locale ?? 'ar-EG', r.suggestions ?? []);
      join = await joinClass(API, code, name).catch(() => null);
    }
  }
  if (!packId) {
    location.replace('/');
    return;
  }
  const packUrl = await packUrlFor(packId);
  void preloadTitle(packUrl, locale).then((t) => setShell(t));
  const [{ mount }] = await Promise.all([enginePromise, fonts]);
  const auth = join?.token ? { authorization: `Bearer ${join.token}` } : undefined;
  const handle = mount(app, {
    packUrl,
    ...(poi ? { startPoi: poi } : {}),
    ...(locale ? { locale } : {}),
    ...(join ? { user: { displayName: join.displayName, studentId: join.studentId, classId: join.classId }, mode: 'student' as const } : { mode: 'guest' as const }),
    ...(join?.assignment ? { assignment: join.assignment } : {}),
    ...(code && !join ? { code } : {}),
    ...(params.get('session') ? { roomToken: params.get('session')! } : join?.roomToken ? { roomToken: join.roomToken } : {}),
    telemetryUrl: `${API}/v1/events`,
    ...(auth ? { telemetryHeaders: () => auth } : {}),
    quality: (params.get('tier') as 'low' | 'mid' | 'high' | null) ?? 'auto',
    perf: params.get('perf') === '1',
    twoD: params.get('mode') === '2d',
    skipIntro: params.get('intro') === '0',
  });
  (window as unknown as { rihla: unknown }).rihla = handle;
  try {
    await handle.ready;
  } finally {
    shell.remove();
  }
}

registerSW();
start(resolveRoute(location.pathname)).catch((e) => {
  console.error(e);
  setShell(null, 'الرحلة مقدرتش تحمّل. اتأكد من النت واعمل ريفرش. · The trip could not load. Check your connection and reload.');
});
