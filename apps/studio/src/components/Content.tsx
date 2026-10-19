import { useMemo, useState } from 'react';
import { SCHEMAS, Entity } from '@rihla/pack-schema/full';
import type { TSchema } from '@sinclair/typebox';
import { SchemaForm } from './SchemaForm';
import { useStudio } from '../lib/store';

const GROUPS: { dir: string; schema: string; list: keyof Manifest }[] = [
  { dir: 'pois', schema: 'poi', list: 'pois' },
  { dir: 'quests', schema: 'quest', list: 'quests' },
  { dir: 'items', schema: 'item', list: 'items' },
  { dir: 'cards', schema: 'card', list: 'cards' },
  { dir: 'dialogue', schema: 'dialogue', list: 'dialogues' },
  { dir: 'models', schema: 'model', list: 'models' },
];
type Manifest = { pois: string[]; quests: string[]; items: string[]; cards: string[]; dialogues: string[]; models?: string[]; scenes: string[] };

const TEMPLATES: Record<string, (id: string) => unknown> = {
  poi: (id) => ({ id: `poi.${id}`, scene: '', at: [0, 0], radius: 40, title: `poi.${id}`, objectives: [] }),
  item: (id) => ({ id: `item.${id}`, type: 'mcq', prompt: `item.${id}.q`, options: [{ id: `item.${id}.o0`, text: `item.${id}.o0`, correct: true }, { id: `item.${id}.o1`, text: `item.${id}.o1` }], hint: `item.${id}.h`, objectives: [], tags: ['needs-fact-check'] }),
  card: (id) => ({ id, body: `card.${id}`, tags: ['needs-fact-check'] }),
  dialogue: (id) => ({ id, lines: [{ text: `dlg.${id}.0` }] }),
  quest: (id) => ({ id, title: `quest.${id}`, mode: 'nearest', steps: [{ id: 'step-1', label: `quest.${id}.s1`, done: { flag: `${id}-done` } }], done: { flag: `${id}-done` }, goal: { next: `quest.${id}.next`, done: `quest.${id}.done` } }),
  model: (id) => ({ id, parts: [{ shape: 'box', args: [1, 1, 1], material: { color: '#c8a874' } }] }),
};

/** Forms over the pack schema for every object type; scenes list their entities (BRIEF §8). */
export function Content() {
  const { files, set, selection, select, dirty, save, t } = useStudio();
  const [filter, setFilter] = useState('');
  const manifest = files['manifest.json'] as Manifest | undefined;
  const sel = selection;
  const scenePaths = manifest?.scenes ?? [];
  const schema = useMemo((): TSchema | null => {
    if (!sel) return null;
    if (sel.path === 'manifest.json') return SCHEMAS.manifest!;
    if (sel.path.startsWith('scenes/')) return sel.entity !== undefined ? Entity : SCHEMAS.scene!;
    const g = GROUPS.find((x) => sel.path.startsWith(`${x.dir}/`));
    return g ? SCHEMAS[g.schema]! : null;
  }, [sel]);
  const value = sel ? (sel.entity !== undefined ? (files[sel.path] as { entities: unknown[] }).entities[sel.entity] : files[sel.path]) : null;
  const onChange = (v: unknown) => {
    if (!sel) return;
    if (sel.entity !== undefined) {
      const sc = files[sel.path] as { entities: unknown[] };
      set(sel.path, { ...sc, entities: sc.entities.map((e, i) => (i === sel.entity ? v : e)) });
    } else set(sel.path, v);
  };
  const f = filter.toLowerCase();
  const add = (g: (typeof GROUPS)[number]) => {
    const id = prompt('id (a-z, 0-9, -)')?.trim().toLowerCase();
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !manifest) return;
    const path = `${g.dir}/${id}.json`;
    set(path, TEMPLATES[g.schema]!(id));
    set('manifest.json', { ...manifest, [g.list]: [...((manifest[g.list] as string[]) ?? []), path] });
    select({ path });
  };
  return (
    <div className="content">
      <nav className="outline" aria-label="pack outline">
        <input className="r-input" placeholder={t('search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" className={`ol ${sel?.path === 'manifest.json' ? 'on' : ''}`} onClick={() => select({ path: 'manifest.json' })}>
          manifest.json {dirty.has('manifest.json') ? '•' : ''}
        </button>
        {scenePaths.map((p) => {
          const sc = files[p] as { entities: { id: string; kind: string }[] } | undefined;
          return (
            <details key={p} open={sel?.path === p}>
              <summary>
                <button type="button" className={`ol ${sel?.path === p && sel.entity === undefined ? 'on' : ''}`} onClick={() => select({ path: p })}>
                  {p} {dirty.has(p) ? '•' : ''}
                </button>
              </summary>
              {(sc?.entities ?? []).map((e, i) =>
                !f || e.id.includes(f) ? (
                  <button key={e.id} type="button" className={`ol sub ${sel?.path === p && sel.entity === i ? 'on' : ''}`} onClick={() => select({ path: p, entity: i })}>
                    {e.id} <small>{e.kind}</small>
                  </button>
                ) : null,
              )}
            </details>
          );
        })}
        {GROUPS.map((g) => (
          <details key={g.dir}>
            <summary>
              {g.dir} <button type="button" className="mini" onClick={() => add(g)} aria-label={`${t('add')} ${g.dir}`}>+</button>
            </summary>
            {((manifest?.[g.list] as string[] | undefined) ?? []).filter((p) => !f || p.includes(f)).map((p) => (
              <button key={p} type="button" className={`ol sub ${sel?.path === p ? 'on' : ''}`} onClick={() => select({ path: p })}>
                {p.replace(`${g.dir}/`, '')} {dirty.has(p) ? '•' : ''}
              </button>
            ))}
          </details>
        ))}
      </nav>
      <section className="editor">
        {sel && schema ? (
          <>
            <div className="r-row" style={{ justifyContent: 'space-between' }}>
              <h2 dir="ltr">{sel.path}{sel.entity !== undefined ? ` › ${(value as { id: string }).id}` : ''}</h2>
              <button type="button" className="r-btn primary" disabled={!dirty.has(sel.path)} onClick={() => void save(sel.path)}>{t('save')}</button>
            </div>
            <SchemaForm key={`${sel.path}:${sel.entity ?? ''}`} schema={schema as never} value={value} onChange={onChange} />
          </>
        ) : null}
      </section>
    </div>
  );
}
