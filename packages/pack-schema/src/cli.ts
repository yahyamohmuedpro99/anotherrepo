#!/usr/bin/env node
import path from 'node:path';
import { buildPack, checkPackDir, formatReport, readPackDir } from './node.js';
import { collectKeys } from './validate.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const outIdx = rest.indexOf('--out');
const out = outIdx >= 0 ? rest[outIdx + 1] : undefined;
const dirs = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--out');
// pnpm --filter runs us from the package folder; resolve pack paths against the repo root when invoked that way.
const root = process.env.INIT_CWD ?? process.cwd();
const abs = (d: string) => path.resolve(root, d);

async function main(): Promise<number> {
  if (cmd === 'check') {
    let failed = 0;
    const reports = [];
    for (const d of dirs) {
      const r = await checkPackDir(abs(d));
      reports.push(r);
      if (!r.ok) failed++;
      if (!flags.has('--json')) console.log(formatReport(r) + '\n');
    }
    if (flags.has('--json')) console.log(JSON.stringify(reports, null, 2));
    return failed ? 1 : 0;
  }
  if (cmd === 'build') {
    for (const d of dirs) {
      const r = await buildPack(abs(d), abs(out ?? 'dist/packs'), { force: flags.has('--force') });
      console.log(`built ${r.id}@${r.version} → ${r.bundleUrl} (${(r.bytes / 1024).toFixed(0)} KB)`);
    }
    return 0;
  }
  if (cmd === 'keys') {
    // Lists keys used by the pack that are missing from a locale: `rihla-pack keys packs/x --locale en`
    const li = rest.indexOf('--locale');
    const loc = li >= 0 ? rest[li + 1] : undefined;
    for (const d of dirs) {
      const { pack } = await readPackDir(abs(d));
      const used = new Set<string>();
      for (const [file, v] of Object.entries(pack.raw)) {
        const kind = file === 'manifest.json' ? 'manifest' : file.split('/')[0]?.replace(/s$/, '').replace('dialogue', 'dialogue');
        const map: Record<string, string> = { scene: 'scene', poi: 'poi', quest: 'quest', item: 'item', card: 'card', dialogue: 'dialogue', model: 'model', glyph: 'glyphs', manifest: 'manifest' };
        if (kind && map[kind]) for (const k of collectKeys(map[kind]!, v)) used.add(k.key);
      }
      const strings = pack.locales[loc ?? pack.manifest.defaultLocale] ?? {};
      for (const k of [...used].sort()) if (!(k in strings)) console.log(k);
    }
    return 0;
  }
  console.log('usage: rihla-pack check <pack-dir>... [--json]\n       rihla-pack build <pack-dir>... --out <dir> [--force]\n       rihla-pack keys <pack-dir> [--locale en]');
  return 2;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
