import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPack } from '@rihla/pack-schema/node';
import type { Database } from '../db/client.js';
import { packVersions, packs } from '../db/schema.js';

const exists = (p: string) => stat(p).then(() => true, () => false);

/**
 * Hosts without a persistent disk (ADR-0021) lose published bundles on every restart while the database keeps
 * them. Rebuild any missing version from the pack folders in the repo, but only when the rebuild has the same
 * content hash as what was published; anything else stays missing and is logged.
 */
export async function restorePacks(database: Database, storageDir: string, sourceDir: string, log: (msg: string) => void): Promise<void> {
  const versions = await database.db.select().from(packVersions);
  const current = new Map((await database.db.select().from(packs)).map((p) => [p.id, p.currentVersion]));
  const tmp = await mkdtemp(path.join(tmpdir(), 'rihla-restore-'));
  try {
    for (const v of versions) {
      if (await exists(path.join(storageDir, v.bundlePath))) continue;
      const src = path.join(sourceDir, v.packId);
      if (!(await exists(path.join(src, 'manifest.json')))) {
        log(`restore: ${v.packId}@${v.version} missing and not in ${sourceDir}`);
        continue;
      }
      const built = await buildPack(src, tmp, { force: true });
      if (built.version !== v.version || built.hash !== v.hash) {
        log(`restore: ${v.packId}@${v.version} in the repo is ${built.version}/${built.hash}, published ${v.hash}; not restored`);
        continue;
      }
      const vdir = path.join(storageDir, v.packId, v.version);
      await mkdir(vdir, { recursive: true });
      await cp(path.join(tmp, v.packId, v.version), vdir, { recursive: true });
      const teacher = path.join(src, 'teacher');
      if (await exists(teacher)) {
        await mkdir(path.join(vdir, 'teacher'), { recursive: true });
        for (const f of await readdir(teacher)) await cp(path.join(teacher, f), path.join(vdir, 'teacher', f));
      }
      log(`restore: ${v.packId}@${v.version} rebuilt from ${src}`);
    }
    // index.json is derived from the database so `current` survives restarts too
    const byPack = new Map<string, typeof versions>();
    for (const v of versions) byPack.set(v.packId, [...(byPack.get(v.packId) ?? []), v]);
    for (const [id, list] of byPack) {
      const published = list.filter((v) => v.status === 'published').sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
      const index = {
        id,
        versions: Object.fromEntries(published.map((v) => [v.version, { bundle: path.relative(id, v.bundlePath), hash: v.hash, builtAt: v.publishedAt.toISOString() }])),
        latest: published.at(-1)?.version,
        current: current.get(id) ?? undefined,
      };
      await mkdir(path.join(storageDir, id), { recursive: true });
      await writeFile(path.join(storageDir, id, 'index.json'), JSON.stringify(index, null, 2));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
