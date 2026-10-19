import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPack, checkPackDir, readPackDir } from '../src/node.js';
import { collectKeys, icuProblem, validatePack } from '../src/validate.js';

const MINI = path.join(__dirname, 'fixtures', 'mini');

async function copyFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rihla-pack-'));
  await fs.cp(MINI, dir, { recursive: true });
  return dir;
}
async function edit(dir: string, file: string, fn: (v: any) => void) {
  const p = path.join(dir, file);
  const v = JSON.parse(await fs.readFile(p, 'utf8'));
  fn(v);
  await fs.writeFile(p, JSON.stringify(v));
}

describe('validator', () => {
  it('accepts the fixture pack', async () => {
    const r = await checkPackDir(MINI);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.reachableScenes.sort()).toEqual(['other', 'world']);
    // curriculum TODO and draft review status are warnings, not errors
    expect(r.warnings.map((w) => w.rule)).toContain('curriculum');
  });

  it('collects keys through recursive actions and conditions', async () => {
    const { pack } = await readPackDir(MINI);
    const keys = collectKeys('scene', pack.scenes.world).map((k) => k.key);
    expect(keys).toContain('door.label');
    const dkeys = collectKeys('dialogue', pack.dialogues.hello).map((k) => k.key);
    expect(dkeys).toEqual(['hello.1']);
  });

  it('fails on a key missing in one locale', async () => {
    const dir = await copyFixture();
    await edit(dir, 'locales/en.json', (v) => delete v['door.label']);
    const r = await checkPackDir(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.rule === 'locales')?.message).toMatch(/door\.label/);
  });

  it('fails on an item with no objective', async () => {
    const dir = await copyFixture();
    await edit(dir, 'items/q1.json', (v) => (v.objectives = []));
    const r = await checkPackDir(dir);
    expect(r.errors.some((e) => e.rule === 'objectives' || e.rule === 'schema')).toBe(true);
  });

  it('fails on an unreachable POI', async () => {
    const dir = await copyFixture();
    await edit(dir, 'scenes/world.json', (v) => (v.entities[1].triggers = []));
    const r = await checkPackDir(dir);
    expect(r.errors.find((e) => e.rule === 'reachability')?.message).toMatch(/poi\.far/);
  });

  it('fails on a POI outside the walkable bounds', async () => {
    const dir = await copyFixture();
    await edit(dir, 'pois/start.json', (v) => (v.at = [900, 0]));
    const r = await checkPackDir(dir);
    expect(r.errors.find((e) => e.rule === 'reachability')?.message).toMatch(/outside/);
  });

  it('fails on unknown references and schema typos', async () => {
    const dir = await copyFixture();
    await edit(dir, 'scenes/world.json', (v) => {
      v.entities[0].triggers[0].do.push({ do: 'show.card', card: 'nope' });
      v.entities[0].colour = 'red';
    });
    const r = await checkPackDir(dir);
    expect(r.errors.some((e) => e.rule === 'references' && /nope/.test(e.message))).toBe(true);
    expect(r.errors.some((e) => e.rule === 'schema')).toBe(true);
  });

  it('fails on an unlicensed asset, a big file and a non-KTX2 world texture', async () => {
    const dir = await copyFixture();
    await fs.mkdir(path.join(dir, 'world'));
    await fs.writeFile(path.join(dir, 'world', 'sand.png'), Buffer.alloc(9 * 1024 * 1024));
    const r = await checkPackDir(dir);
    const rules = r.errors.map((e) => e.rule);
    expect(rules).toContain('licences');
    expect(rules).toContain('file-size');
    expect(rules).toContain('ktx2');
  });

  it('enforces download budgets per tier', async () => {
    const { pack, files } = await readPackDir(MINI);
    pack.manifest.budgets.low.downloadMB = 0.0001;
    const r = validatePack(pack, { files });
    expect(r.errors.some((e) => e.rule === 'budgets')).toBe(true);
  });

  it('checks ICU syntax', () => {
    expect(icuProblem('Hi {name}')).toBeNull();
    expect(icuProblem('{n, plural, one {#} other {# items}}')).toBeNull();
    expect(icuProblem('{n, plural, one {#}}')).toMatch(/other/);
    expect(icuProblem('oops {')).toMatch(/unbalanced/);
  });
});

describe('build', () => {
  it('writes an immutable content-hashed bundle', async () => {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), 'rihla-out-'));
    const a = await buildPack(MINI, out);
    const b = await buildPack(MINI, out);
    expect(a.hash).toBe(b.hash);
    const index = JSON.parse(await fs.readFile(path.join(out, 'mini', 'index.json'), 'utf8'));
    expect(index.latest).toBe('1.0.0');
    const dir = await copyFixture();
    await edit(dir, 'locales/en.json', (v) => (v['pack.title'] = 'Changed'));
    await expect(buildPack(dir, out)).rejects.toThrow(/immutable/);
  });
});
