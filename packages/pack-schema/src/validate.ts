import { Value } from '@sinclair/typebox/value';
import type { TSchema } from '@sinclair/typebox';
import { Action, Cond, SCHEMAS, type Action as ActionT, type Cond as CondT, type Entity, type ModelRef, type Scene } from './schema.js';
import type { PackData } from './load.js';
import { estimateScene, type SceneEstimate } from './estimate.js';

export type Severity = 'error' | 'warning';
export interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  path?: string;
  message: string;
}
export interface FileInfo {
  path: string;
  bytes: number;
}
export interface ValidationReport {
  pack: string;
  version: string;
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  stats: {
    files: number;
    downloadMB: number;
    keys: number;
    scenes: Record<string, SceneEstimate>;
    reachableScenes: string[];
  };
  checklist: { rule: string; label: string; ok: boolean; count: number }[];
}

export const RULES: Record<string, string> = {
  schema: 'Every file matches the pack schema',
  references: 'Every id reference resolves',
  locales: 'Every string key exists in every declared locale',
  icu: 'Every string is valid ICU MessageFormat',
  licences: 'Every asset has an entry in LICENSES.json',
  objectives: 'Every item maps to at least one objective',
  reachability: 'Every POI is reachable from startPoi',
  budgets: 'Download, draw-call and texture budgets hold on every tier',
  'file-size': 'No file is larger than 8 MB',
  ktx2: 'World textures are KTX2',
  media: 'Every media item carries source, author, licence and attribution',
  length: 'Cards ≤ 60 words, dialogue lines ≤ 25 words',
  curriculum: 'Curriculum lessons are mapped',
};

const REFS: TSchema[] = [Cond, Action];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/* ---------------------------------------------------------------- schema-aware walk */

type Visit = (kind: 'key', value: string, path: string) => void;

function resolve(schema: TSchema, refs: Map<string, TSchema>): TSchema {
  let s = schema as TSchema & { $ref?: string };
  let guard = 0;
  while (s.$ref && guard++ < 10) s = (refs.get(s.$ref) ?? s) as TSchema & { $ref?: string };
  return s;
}

function walk(schema: TSchema, value: unknown, path: string, refs: Map<string, TSchema>, visit: Visit): void {
  const s = resolve(schema, refs) as TSchema & {
    anyOf?: TSchema[];
    properties?: Record<string, TSchema>;
    patternProperties?: Record<string, TSchema>;
    items?: TSchema | TSchema[];
    additionalProperties?: TSchema | boolean;
    description?: string;
    type?: string;
  };
  if (s.description === 'Locale key' && typeof value === 'string') {
    visit('key', value, path);
    return;
  }
  if (s.anyOf) {
    const branch = s.anyOf.find((b) => Value.Check(b, REFS, value));
    if (branch) walk(branch, value, path, refs, visit);
    return;
  }
  if (Array.isArray(value)) {
    const items = s.items;
    if (Array.isArray(items)) value.forEach((v, i) => items[i] && walk(items[i]!, v, `${path}[${i}]`, refs, visit));
    else if (items) value.forEach((v, i) => walk(items, v, `${path}[${i}]`, refs, visit));
    return;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const child =
        s.properties?.[k] ??
        (s.patternProperties ? Object.values(s.patternProperties)[0] : undefined) ??
        (typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined);
      if (child) walk(child, v, `${path}.${k}`, refs, visit);
    }
  }
}

const refMap = new Map<string, TSchema>([
  ['Cond', Cond],
  ['Action', Action],
]);

/** All locale keys used by a file, with JSON paths. */
export function collectKeys(schemaName: string, value: unknown): { key: string; path: string }[] {
  const out: { key: string; path: string }[] = [];
  const schema = SCHEMAS[schemaName];
  if (!schema) return out;
  walk(schema, value, '$', refMap, (_k, v, p) => out.push({ key: v, path: p }));
  return out;
}

/* ---------------------------------------------------------------- action / condition walkers */

export function* eachAction(value: unknown): Generator<ActionT> {
  if (Array.isArray(value)) {
    for (const v of value) yield* eachAction(v);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  if (typeof o.do === 'string' && o.do.includes('.')) yield o as unknown as ActionT;
  for (const v of Object.values(o)) if (v && typeof v === 'object') yield* eachAction(v);
}

export function* eachCond(value: unknown): Generator<CondT> {
  if (Array.isArray(value)) {
    for (const v of value) yield* eachCond(v);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (['when', 'done', 'state', 'showWhen', 'hideWhen', 'check', 'bang', 'goWhen', 'not'].includes(k) && v && typeof v === 'object') {
      yield* flattenCond(v as CondT);
    } else if (v && typeof v === 'object') yield* eachCond(v);
  }
}
function* flattenCond(c: CondT): Generator<CondT> {
  yield c;
  if ('not' in c) yield* flattenCond(c.not);
  if ('all' in c) for (const x of c.all) yield* flattenCond(x);
  if ('any' in c) for (const x of c.any) yield* flattenCond(x);
}

/* ---------------------------------------------------------------- ICU check */

export function icuProblem(s: string): string | null {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && (s[i + 1] === '{' || s[i + 1] === '}' || quoted)) {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth < 0) return 'unbalanced "}"';
    }
  }
  if (depth !== 0) return 'unbalanced "{"';
  const plural = /\{\s*\w+\s*,\s*(plural|select)\s*,([^]*)\}/.exec(s);
  if (plural && !/other\s*\{/.test(plural[2] ?? '')) return `${plural[1]} without an "other" case`;
  return null;
}

export const wordCount = (s: string) => s.replace(/\{[^}]*\}/g, 'x').split(/\s+/).filter(Boolean).length;

/* ---------------------------------------------------------------- the validator */

export interface ValidateOptions {
  files?: FileInfo[];
}

export function validatePack(pack: PackData, opts: ValidateOptions = {}): ValidationReport {
  const findings: Finding[] = [];
  const add = (severity: Severity, rule: string, file: string, message: string, path?: string) =>
    findings.push({ severity, rule, file, message, ...(path ? { path } : {}) });
  const m = pack.manifest;

  // 1. schema
  const kindOf = (file: string): string | null => {
    if (file === 'manifest.json') return 'manifest';
    if (file === 'LICENSES.json') return 'licenses';
    if (file.startsWith('locales/')) return 'locale';
    if (file.startsWith('overlays/')) return file.endsWith('overlay.json') ? 'overlay' : 'locale';
    const dir = file.split('/')[0];
    const map: Record<string, string> = { scenes: 'scene', pois: 'poi', quests: 'quest', items: 'item', cards: 'card', dialogue: 'dialogue', dialogues: 'dialogue', models: 'model', glyphs: 'glyphs' };
    return (dir && map[dir]) ?? null;
  };
  for (const [file, value] of Object.entries(pack.raw)) {
    const kind = kindOf(file);
    if (!kind) continue;
    const schema = SCHEMAS[kind]!;
    let n = 0;
    for (const e of Value.Errors(schema, REFS, value)) {
      if (n++ > 12) break;
      add('error', 'schema', file, e.message, e.path || '/');
    }
  }

  // 2. references
  const ids = {
    scenes: new Set(Object.keys(pack.scenes)),
    pois: new Set(Object.keys(pack.pois)),
    quests: new Set(Object.keys(pack.quests)),
    items: new Set(Object.keys(pack.items)),
    cards: new Set(Object.keys(pack.cards)),
    dialogues: new Set(Object.keys(pack.dialogues)),
    models: new Set(Object.keys(pack.models)),
    glyphs: new Set(Object.keys(pack.glyphs)),
    counters: new Set(m.counters.map((c) => c.id)),
    flags: new Set((m.flags ?? []).map((f) => f.id)),
    stamps: new Set(m.stamps.map((s) => s.id)),
    objectives: new Set(m.objectives.map((o) => o.id)),
    characters: new Set(Object.keys(m.characters)),
    titles: new Set((m.titles ?? []).map((t) => t.id)),
    entities: new Set<string>(),
  };
  const entityScene = new Map<string, string>();
  for (const s of Object.values(pack.scenes)) {
    for (const e of s.entities) {
      if (ids.entities.has(e.id)) add('error', 'references', `scenes/${s.id}.json`, `Duplicate entity id "${e.id}"`);
      ids.entities.add(e.id);
      entityScene.set(e.id, s.id);
    }
  }
  const fileOf = (kind: string, id: string) => {
    const hit = Object.entries(pack.raw).find(([p, v]) => p.startsWith(kind) && (v as { id?: string })?.id === id);
    return hit?.[0] ?? kind;
  };
  const need = (set: Set<string>, id: string | undefined, what: string, file: string) => {
    if (id !== undefined && !set.has(id)) add('error', 'references', file, `Unknown ${what} "${id}"`);
  };
  need(ids.scenes, m.startScene, 'scene', 'manifest.json');
  need(ids.pois, m.startPoi, 'POI', 'manifest.json');
  need(ids.quests, m.hud.quest, 'quest', 'manifest.json');
  for (const id of [...(m.prePost?.pre ?? []), ...(m.prePost?.post ?? [])]) need(ids.items, id, 'item', 'manifest.json');

  for (const [file, value] of Object.entries(pack.raw)) {
    for (const a of eachAction(value)) {
      switch (a.do) {
        case 'show.dialogue': need(ids.dialogues, a.dialogue, 'dialogue', file); break;
        case 'show.card': need(ids.cards, a.card, 'card', file); break;
        case 'ask.item': need(ids.items, a.item, 'item', file); break;
        case 'give.stamp': need(ids.stamps, a.stamp, 'stamp', file); break;
        case 'set.flag': need(ids.flags, a.flag, 'flag', file); break;
        case 'add.counter': need(ids.counters, a.counter, 'counter', file); break;
        case 'start.quest': case 'complete.quest': case 'quest.go': need(ids.quests, a.quest, 'quest', file); break;
        case 'go.scene': {
          need(ids.scenes, a.scene, 'scene', file);
          const sc = pack.scenes[a.scene];
          if (sc && a.spawn && !sc.spawns[a.spawn]) add('error', 'references', file, `Scene "${a.scene}" has no spawn "${a.spawn}"`);
          break;
        }
        case 'travel.to': case 'camera.flyTo': if (typeof a.target === 'string') need(ids.entities, a.target, 'entity', file); break;
        case 'vehicle.mount': need(ids.entities, a.entity, 'entity', file); break;
        case 'show.glyphs': need(ids.glyphs, a.alphabet, 'glyph alphabet', file); break;
        default: break;
      }
    }
    for (const c of eachCond(value)) {
      if ('flag' in c) need(ids.flags, c.flag, 'flag', file);
      if ('counter' in c) need(ids.counters, c.counter, 'counter', file);
      if ('stamp' in c) need(ids.stamps, c.stamp, 'stamp', file);
      if ('quest' in c) need(ids.quests, c.quest, 'quest', file);
      if ('scene' in c) need(ids.scenes, c.scene, 'scene', file);
    }
  }
  for (const s of Object.values(pack.scenes)) {
    const f = `scenes/${s.id}.json`;
    for (const e of s.entities) {
      if (e.poi) need(ids.pois, e.poi, 'POI', f);
      if (e.npc) need(ids.characters, e.npc.character, 'character', f);
      if (e.photo) need(ids.counters, e.photo.counter, 'counter', f);
      for (const mr of modelRefs(e.model)) if (mr.gen === 'composite') need(ids.models, mr.ref, 'model', f);
      if (e.motion?.entity) need(ids.entities, e.motion.entity, 'entity', f);
      if (typeof e.motion?.center === 'string') need(ids.entities, e.motion.center, 'entity', f);
    }
    for (const a of s.areas?.list ?? []) {
      if (a.card) need(ids.cards, a.card, 'card', f);
      if (a.poi) need(ids.pois, a.poi, 'POI', f);
    }
    for (const t of s.hud?.travelBar ?? []) need(ids.entities, t.entity, 'entity', f);
    if (s.enter?.descent) need(ids.entities, s.enter.descent.entity, 'entity', f);
    for (const [name, sp] of Object.entries(s.spawns)) if (sp.near) need(ids.entities, sp.near.entity, `entity (spawn ${name})`, f);
  }
  for (const p of Object.values(pack.pois)) {
    const f = fileOf('pois', p.id);
    need(ids.scenes, p.scene, 'scene', f);
    if (p.card) need(ids.cards, p.card, 'card', f);
    for (const o of p.objectives) need(ids.objectives, o, 'objective', f);
    for (const it of p.items ?? []) need(ids.items, it, 'item', f);
    if (p.spawn?.spawn && pack.scenes[p.scene] && !pack.scenes[p.scene]!.spawns[p.spawn.spawn])
      add('error', 'references', f, `Scene "${p.scene}" has no spawn "${p.spawn.spawn}"`);
  }
  for (const q of Object.values(pack.quests)) {
    const f = fileOf('quests', q.id);
    if (q.progress) need(ids.counters, q.progress.counter, 'counter', f);
    for (const st of q.steps) if (typeof st.target === 'string') need(ids.entities, st.target, 'entity', f);
    for (const o of q.objectives ?? []) need(ids.objectives, o, 'objective', f);
  }
  for (const d of Object.values(pack.dialogues)) {
    const f = fileOf('dialogue', d.id);
    for (const l of d.lines) if (l.speaker) need(ids.characters, l.speaker, 'character', f);
    if (d.anchor) need(ids.entities, d.anchor, 'entity', f);
  }

  // 3. objectives
  for (const it of Object.values(pack.items)) {
    const f = fileOf('items', it.id);
    if (!it.objectives?.length) add('error', 'objectives', f, `Item "${it.id}" maps to no objective`);
    for (const o of it.objectives ?? []) need(ids.objectives, o, 'objective', f);
    if (it.type === 'mcq' && !(it.options ?? []).some((o) => o.correct)) add('error', 'schema', f, `MCQ "${it.id}" has no correct option`);
    if (it.type === 'numeric' && (it.answer === undefined || it.tolerance === undefined)) add('error', 'schema', f, `Numeric "${it.id}" needs answer and tolerance`);
  }
  for (const c of Object.values(pack.cards)) for (const o of c.objectives ?? []) need(ids.objectives, o, 'objective', fileOf('cards', c.id));
  const usedObjectives = new Set<string>();
  for (const it of Object.values(pack.items)) for (const o of it.objectives) usedObjectives.add(o);
  for (const o of m.objectives) if (!usedObjectives.has(o.id)) add('warning', 'objectives', 'manifest.json', `Objective "${o.id}" has no assessment item`);

  // 4. locale keys
  const allKeys = new Map<string, string>();
  for (const [file, value] of Object.entries(pack.raw)) {
    const kind = kindOf(file);
    if (!kind || kind === 'locale' || kind === 'licenses') continue;
    for (const { key, path } of collectKeys(kind, value)) if (!allKeys.has(key)) allKeys.set(key, `${file} ${path}`);
  }
  for (const loc of m.locales) {
    const strings = pack.locales[loc];
    if (!strings) {
      add('error', 'locales', `locales/${loc}.json`, `Locale file missing`);
      continue;
    }
    for (const [key, where] of allKeys) {
      // engine.* keys have engine defaults; a pack may override them
      if (!(key in strings) && !key.startsWith('engine.')) add('error', 'locales', `locales/${loc}.json`, `Missing key "${key}" (used in ${where})`);
    }
    for (const [key, val] of Object.entries(strings)) {
      const p = icuProblem(val);
      if (p) add('error', 'icu', `locales/${loc}.json`, `"${key}": ${p}`);
    }
  }
  const def = pack.locales[m.defaultLocale] ?? {};
  // keys can also be referenced from generator params (signs) or implicitly by the engine (arrival toasts)
  const anyString = new Set<string>();
  const scan = (v: unknown): void => {
    if (typeof v === 'string') anyString.add(v);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  for (const [file, v] of Object.entries(pack.raw)) if (!file.startsWith('locales/') && !file.startsWith('overlays/')) scan(v);
  const IMPLICIT = new Set(['arrival', 'photo.spotDone', 'balloon.rings', 'quest.flying']);
  for (const k of Object.keys(def)) if (!allKeys.has(k) && !anyString.has(k) && !IMPLICIT.has(k) && !k.startsWith('engine.')) add('warning', 'locales', `locales/${m.defaultLocale}.json`, `Unused key "${k}"`);

  // 5. lengths
  for (const c of Object.values(pack.cards)) {
    const text = def[c.body];
    if (text && wordCount(text) > 60) add('warning', 'length', fileOf('cards', c.id), `Card "${c.id}" has ${wordCount(text)} words (> 60)`);
  }
  for (const d of Object.values(pack.dialogues)) {
    d.lines.forEach((l, i) => {
      const k = typeof l.text === 'string' ? l.text : l.text.key;
      const text = def[k];
      if (text && wordCount(text) > 25) add('warning', 'length', fileOf('dialogue', d.id), `Line ${i + 1} of "${d.id}" has ${wordCount(text)} words (> 25)`);
    });
  }

  // 6. reachability
  const reachable = reachableScenes(pack);
  for (const p of Object.values(pack.pois)) {
    const f = fileOf('pois', p.id);
    if (!reachable.has(p.scene)) add('error', 'reachability', f, `POI "${p.id}" is in scene "${p.scene}", which no path from "${m.startScene}" reaches`);
    const sc = pack.scenes[p.scene];
    const b = sc?.player.bounds;
    if (b && sc?.kind === 'terrain') {
      const [x, z] = p.at.length === 3 ? [p.at[0], p.at[2]] : [p.at[0], p.at[1]];
      if (Math.hypot(x - b.center[0], z - b.center[1]) > b.radius) add('error', 'reachability', f, `POI "${p.id}" lies outside the walkable bounds`);
    }
  }
  if (pack.pois[m.startPoi] && pack.pois[m.startPoi]!.scene !== m.startScene)
    add('warning', 'reachability', 'manifest.json', `startPoi is not in startScene`);

  // 7. files: size, licences, textures
  const files = opts.files ?? [];
  const licensed = new Set((pack.licenses?.assets ?? []).map((a) => a.path));
  for (const f of files) {
    if (f.bytes > MAX_FILE_BYTES) add('error', 'file-size', f.path, `${(f.bytes / 1048576).toFixed(1)} MB > 8 MB`);
    const isJson = f.path.endsWith('.json');
    const isDoc = /\.(md|txt|pdf)$/i.test(f.path) || f.path.startsWith('teacher/');
    if (!isJson && !isDoc && !licensed.has(f.path)) add('error', 'licences', f.path, 'Asset has no entry in LICENSES.json');
    if (/^world\/.*\.(png|jpe?g|webp|avif)$/i.test(f.path)) add('error', 'ktx2', f.path, 'World textures must be KTX2');
  }
  for (const c of Object.values(pack.cards)) {
    if (!c.media) continue;
    const mm = c.media;
    for (const k of ['sourceUrl', 'author', 'licence', 'licenceUrl', 'attribution'] as const)
      if (!mm[k]) add('error', 'media', fileOf('cards', c.id), `Media "${mm.src}" has no ${k}`);
  }

  // 8. budgets
  const downloadMB = files.reduce((s, f) => s + f.bytes, 0) / 1048576;
  const sceneStats: Record<string, SceneEstimate> = {};
  for (const s of Object.values(pack.scenes)) sceneStats[s.id] = estimateScene(s, pack.models);
  for (const tier of ['low', 'mid', 'high'] as const) {
    const b = m.budgets[tier];
    if (!b) continue;
    if (files.length && downloadMB > b.downloadMB) add('error', 'budgets', 'manifest.json', `Download ${downloadMB.toFixed(2)} MB > ${b.downloadMB} MB on ${tier}`);
    for (const [id, st] of Object.entries(sceneStats)) {
      const calls = st.drawCalls[tier];
      // The static estimate assumes everything is on screen at once (no frustum culling, night-only effects
      // in daylight). Within 2x it is a warning to confirm with the measured perf smoke test; beyond, an error.
      if (calls > b.drawCalls * 2) add('error', 'budgets', `scenes/${id}.json`, `~${calls} estimated draw calls > 2 × ${b.drawCalls} on ${tier}`);
      else if (calls > b.drawCalls) add('warning', 'budgets', `scenes/${id}.json`, `~${calls} estimated draw calls (all-visible upper bound) > ${b.drawCalls} on ${tier}; confirm with pnpm perf`);
      if (st.textureMB[tier] > b.textureMB) add('error', 'budgets', `scenes/${id}.json`, `~${st.textureMB[tier].toFixed(1)} MB textures > ${b.textureMB} MB on ${tier}`);
    }
  }

  // 9. curriculum
  for (const c of [...m.curriculum, ...m.objectives.flatMap((o) => o.curriculum ?? [])])
    if (/todo/i.test(c.lesson)) {
      add('warning', 'curriculum', 'manifest.json', `Curriculum lesson for ${c.country} ${c.grade} is not mapped yet`);
      break;
    }
  if (m.reviewStatus !== 'published' && m.reviewStatus !== 'approved')
    add('warning', 'schema', 'manifest.json', `reviewStatus is "${m.reviewStatus}"`);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return {
    pack: m.id,
    version: m.version,
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { files: files.length || Object.keys(pack.raw).length, downloadMB: +downloadMB.toFixed(3), keys: allKeys.size, scenes: sceneStats, reachableScenes: [...reachable] },
    checklist: Object.entries(RULES).map(([rule, label]) => ({ rule, label, ok: !errors.some((e) => e.rule === rule), count: findings.filter((f) => f.rule === rule).length })),
  };
}

export function modelRefs(m: ModelRef | undefined): ModelRef[] {
  if (!m) return [];
  const out = [m];
  if (m.lowTier && typeof m.lowTier === 'object') out.push(...modelRefs(m.lowTier as ModelRef));
  return out;
}

/** Scenes reachable from the start scene through go.scene actions. Global content (dialogues, quests,
 * items, manifest collections) can run anywhere, so its edges apply from every reachable scene. */
export function reachableScenes(pack: PackData): Set<string> {
  const global: string[] = [];
  const perScene = new Map<string, string[]>();
  const targetsIn = (v: unknown) => [...eachAction(v)].filter((a): a is Extract<ActionT, { do: 'go.scene' }> => a.do === 'go.scene').map((a) => a.scene);
  for (const [file, v] of Object.entries(pack.raw)) {
    if (file.startsWith('scenes/')) perScene.set((v as Scene).id, targetsIn(v));
    else global.push(...targetsIn(v));
  }
  const seen = new Set<string>([pack.manifest.startScene]);
  const queue = [pack.manifest.startScene];
  while (queue.length) {
    const s = queue.shift()!;
    for (const t of [...(perScene.get(s) ?? []), ...global]) if (!seen.has(t)) {
      seen.add(t);
      queue.push(t);
    }
  }
  return seen;
}

export type { Entity };
