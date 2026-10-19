/** Node-only helpers: read a pack folder, validate it, build an immutable content-hashed bundle. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadPack, type PackBundle, type PackData } from './load.js';
import { validatePack, type FileInfo, type ValidationReport } from './validate.js';

export * from './index.js';

async function listFiles(dir: string, base = dir): Promise<FileInfo[]> {
  const out: FileInfo[] = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push({ path: path.relative(base, full).split(path.sep).join('/'), bytes: (await fs.stat(full)).size });
  }
  return out;
}

export async function readPackDir(dir: string): Promise<{ pack: PackData; files: FileInfo[] }> {
  const files = await listFiles(dir);
  const pack = await loadPack(async (p) => {
    const text = await fs.readFile(path.join(dir, p), 'utf8');
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${p}: invalid JSON (${(e as Error).message})`);
    }
  }, dir);
  // Files present in the folder but never referenced are worth knowing about.
  return { pack, files };
}

export async function checkPackDir(dir: string): Promise<ValidationReport> {
  try {
    const { pack, files } = await readPackDir(dir);
    const report = validatePack(pack, { files });
    const referenced = new Set(Object.keys(pack.raw));
    for (const f of files) {
      if (f.path.endsWith('.json') && !referenced.has(f.path))
        report.warnings.push({ severity: 'warning', rule: 'references', file: f.path, message: 'JSON file is not referenced by the manifest' });
    }
    return report;
  } catch (e) {
    return {
      pack: path.basename(dir),
      version: '?',
      ok: false,
      errors: [{ severity: 'error', rule: 'schema', file: 'manifest.json', message: (e as Error).message }],
      warnings: [],
      stats: { files: 0, downloadMB: 0, keys: 0, scenes: {}, reachableScenes: [] },
      checklist: [],
    };
  }
}

const canon = (v: unknown): string => JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1))) : val));

export interface BuildResult {
  id: string;
  version: string;
  hash: string;
  bundlePath: string;
  bundleUrl: string;
  bytes: number;
}

/** Builds `<out>/<id>/<version>/bundle.<hash>.json` (+ hashed assets) and updates `<out>/<id>/index.json`. */
export async function buildPack(dir: string, out: string, opts: { force?: boolean } = {}): Promise<BuildResult> {
  const report = await checkPackDir(dir);
  if (!report.ok) throw new Error(`${report.pack}: ${report.errors.length} validation error(s); run rihla-pack check`);
  const { pack, files } = await readPackDir(dir);
  const m = pack.manifest;
  const assets: Record<string, string> = {};
  const assetHashes: string[] = [];
  const vdir = path.join(out, m.id, m.version);
  await fs.mkdir(vdir, { recursive: true });
  for (const f of files) {
    if (f.path.endsWith('.json') || f.path.startsWith('teacher/') || f.path.endsWith('.md')) continue;
    const buf = await fs.readFile(path.join(dir, f.path));
    const h = createHash('sha256').update(buf).digest('hex').slice(0, 12);
    const ext = path.extname(f.path);
    const name = `assets/${path.basename(f.path, ext)}.${h}${ext}`;
    await fs.mkdir(path.join(vdir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(vdir, name), buf);
    assets[f.path] = name;
    assetHashes.push(f.path + h);
  }
  const hash = createHash('sha256').update(canon(pack.raw)).update(assetHashes.join()).digest('hex').slice(0, 12);
  const bundle: PackBundle = { format: 'rihla-pack-bundle@1', id: m.id, version: m.version, hash, builtAt: new Date().toISOString(), files: pack.raw, assets };
  const bundleName = `bundle.${hash}.json`;
  const existing = (await fs.readdir(vdir).catch(() => [] as string[])).filter((f) => f.startsWith('bundle.') && f !== bundleName);
  if (existing.length && !opts.force) throw new Error(`${m.id}@${m.version} is already published with different content (${existing.join(', ')}). Published packs are immutable: bump the version.`);
  for (const old of existing) await fs.rm(path.join(vdir, old));
  const body = JSON.stringify(bundle);
  await fs.writeFile(path.join(vdir, bundleName), body);
  await fs.writeFile(path.join(vdir, 'manifest.json'), JSON.stringify(m, null, 2));
  for (const [rel] of Object.entries(pack.raw)) {
    if (rel.startsWith('locales/')) {
      await fs.mkdir(path.join(vdir, 'locales'), { recursive: true });
      await fs.writeFile(path.join(vdir, rel), JSON.stringify(pack.raw[rel]));
    }
  }
  const indexPath = path.join(out, m.id, 'index.json');
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8').catch(() => '{"versions":{}}')) as { id?: string; latest?: string; versions: Record<string, { bundle: string; hash: string; builtAt: string }> };
  index.id = m.id;
  index.versions[m.version] = { bundle: `${m.version}/${bundleName}`, hash, builtAt: bundle.builtAt };
  index.latest = Object.keys(index.versions).sort(cmpSemver).pop();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  return { id: m.id, version: m.version, hash, bundlePath: path.join(vdir, bundleName), bundleUrl: `${m.id}/${m.version}/${bundleName}`, bytes: body.length };
}

export function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export function formatReport(r: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`${r.ok ? '✔' : '✘'} ${r.pack}@${r.version} — ${r.errors.length} error(s), ${r.warnings.length} warning(s), ${r.stats.files} files, ${r.stats.downloadMB} MB, ${r.stats.keys} string keys`);
  for (const c of r.checklist) lines.push(`   ${c.ok ? '✔' : '✘'} ${c.label}${c.count ? ` (${c.count})` : ''}`);
  for (const [id, s] of Object.entries(r.stats.scenes)) lines.push(`   scene ${id}: ${s.entities} entities, ~draw calls low/mid/high ${s.drawCalls.low}/${s.drawCalls.mid}/${s.drawCalls.high}, ~textures ${s.textureMB.low} MB`);
  for (const e of r.errors) lines.push(`   ERROR [${e.rule}] ${e.file}${e.path ? ' ' + e.path : ''}: ${e.message}`);
  for (const w of r.warnings) lines.push(`   warn  [${w.rule}] ${w.file}${w.path ? ' ' + w.path : ''}: ${w.message}`);
  return lines.join('\n');
}
