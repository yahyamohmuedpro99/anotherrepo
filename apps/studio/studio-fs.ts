/**
 * Dev-server middleware for the Studio (internal tool, v1): reads and writes pack folders in this repository,
 * keeps revisions in git, builds bundles, and stores media with their licence entries. It only ever touches
 * files under packs/<id>/ and refuses anything else.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PACKS = path.join(ROOT, 'packs');
const ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
const TEXT = /\.(json|md)$/;
const MEDIA = /\.(png|jpe?g|webp|ktx2|glb|gltf|mp3|ogg|m4a|svg)$/i;

function inPack(id: string, rel: string): string {
  if (!ID.test(id)) throw Object.assign(new Error('bad pack id'), { status: 400 });
  const p = path.resolve(PACKS, id, rel);
  if (!p.startsWith(path.join(PACKS, id) + path.sep)) throw Object.assign(new Error('path outside pack'), { status: 400 });
  return p;
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function walk(dir: string, base = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

const send = (res: ServerResponse, status: number, data: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(Buffer.isBuffer(data) || typeof data === 'string' ? data : JSON.stringify(data));
};

export function studioFs(): Plugin {
  return {
    name: 'rihla-studio-fs',
    configureServer(server) {
      server.middlewares.use('/studio-api', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x');
          const parts = url.pathname.split('/').filter(Boolean);
          const method = req.method ?? 'GET';
          // GET /packs
          if (parts[0] === 'packs' && parts.length === 1) {
            const ids = (await readdir(PACKS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
            return send(res, 200, { packs: ids });
          }
          const id = parts[1] ?? '';
          // GET /packs/:id/files → every JSON/Markdown file, parsed
          if (parts[2] === 'files' && method === 'GET') {
            const all = await walk(path.join(PACKS, id));
            const files: Record<string, unknown> = {};
            for (const f of all.filter((x) => TEXT.test(x))) {
              const text = await readFile(inPack(id, f), 'utf8');
              files[f] = f.endsWith('.json') ? JSON.parse(text) : text;
            }
            return send(res, 200, { files, media: all.filter((x) => MEDIA.test(x)) });
          }
          // GET /packs/:id/raw/<path> → the engine preview loads the pack folder from here
          if (parts[2] === 'raw') {
            const rel = parts.slice(3).map(decodeURIComponent).join('/');
            const p = inPack(id, rel);
            const buf = await readFile(p);
            return send(res, 200, buf, rel.endsWith('.json') ? 'application/json' : 'application/octet-stream');
          }
          // PUT /packs/:id/file?path= → save one file (JSON pretty-printed like the port tools)
          if (parts[2] === 'file' && method === 'PUT') {
            const rel = url.searchParams.get('path') ?? '';
            if (!TEXT.test(rel)) throw Object.assign(new Error('only .json and .md'), { status: 400 });
            const p = inPack(id, rel);
            await mkdir(path.dirname(p), { recursive: true });
            const raw = (await body(req)).toString('utf8');
            await writeFile(p, rel.endsWith('.json') ? JSON.stringify(JSON.parse(raw), null, 1) + '\n' : raw);
            return send(res, 200, { ok: true });
          }
          // POST /packs/:id/media?path=&meta= → binary upload; licence fields are mandatory (BRIEF §14)
          if (parts[2] === 'media' && method === 'POST') {
            const rel = url.searchParams.get('path') ?? '';
            if (!MEDIA.test(rel)) throw Object.assign(new Error('unsupported media type'), { status: 400 });
            const meta = JSON.parse(url.searchParams.get('meta') ?? '{}') as Record<string, string>;
            for (const k of ['title', 'sourceUrl', 'author', 'licence', 'licenceUrl', 'attribution']) if (!meta[k]?.trim()) throw Object.assign(new Error(`licence field missing: ${k}`), { status: 400 });
            const p = inPack(id, rel);
            await mkdir(path.dirname(p), { recursive: true });
            await writeFile(p, await body(req));
            const licPath = inPack(id, 'LICENSES.json');
            const lic = JSON.parse(await readFile(licPath, 'utf8').catch(() => '{"assets":[]}')) as { assets: Record<string, string>[] };
            lic.assets = lic.assets.filter((a) => a.path !== rel);
            lic.assets.push({ path: rel, title: meta.title!, sourceUrl: meta.sourceUrl!, author: meta.author!, licence: meta.licence!, licenceUrl: meta.licenceUrl!, attribution: meta.attribution!, ...(meta.permit ? { permit: meta.permit } : {}) });
            await writeFile(licPath, JSON.stringify(lic, null, 1) + '\n');
            const { size } = await stat(p);
            return send(res, 200, { ok: true, size });
          }
          // POST /packs/:id/build → validated, content-hashed bundle (for publishing through the API)
          if (parts[2] === 'build' && method === 'POST') {
            const { buildPack } = await import('@rihla/pack-schema/node');
            const out = await mkdtemp(path.join(tmpdir(), 'studio-build-'));
            const r = await buildPack(path.join(PACKS, id), out);
            const teacher: Record<string, string> = {};
            for (const d of ['lesson-plan', 'worksheet', 'answer-key']) teacher[d] = await readFile(inPack(id, `teacher/${d}.md`), 'utf8').catch(() => '');
            return send(res, 200, { bundle: JSON.parse(await readFile(r.bundlePath, 'utf8')), teacher });
          }
          // Revisions live in git: GET /packs/:id/revisions, GET /packs/:id/diff?from=&to=, POST /packs/:id/revision
          if (parts[2] === 'revisions') {
            const { stdout } = await run('git', ['log', '--format=%h%x09%ad%x09%an%x09%s', '--date=short', '-n', '50', '--', `packs/${id}`], { cwd: ROOT });
            return send(res, 200, { revisions: stdout.trim().split('\n').filter(Boolean).map((l) => { const [hash, date, author, subject] = l.split('\t'); return { hash, date, author, subject }; }) });
          }
          if (parts[2] === 'diff') {
            const from = url.searchParams.get('from') ?? 'HEAD', to = url.searchParams.get('to');
            if (![from, to ?? ''].every((x) => /^[0-9a-fA-F]{0,40}$|^HEAD$/.test(x))) throw Object.assign(new Error('bad revision'), { status: 400 });
            const { stdout } = await run('git', ['diff', '--stat', '--patch', from, ...(to ? [to] : []), '--', `packs/${id}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
            return send(res, 200, stdout, 'text/plain; charset=utf-8');
          }
          if (parts[2] === 'revision' && method === 'POST') {
            const { message, author } = JSON.parse((await body(req)).toString('utf8')) as { message: string; author: string };
            if (!message?.trim()) throw Object.assign(new Error('message required'), { status: 400 });
            await run('git', ['add', '--', `packs/${id}`], { cwd: ROOT });
            const { stdout } = await run('git', ['commit', '-m', `${id}: ${message.trim()}`, ...(author ? ['--author', `${author.replace(/[<>]/g, '')} <studio@rihla.local>`] : []), '--', `packs/${id}`], { cwd: ROOT }).catch((e: { stdout?: string; stderr?: string }) => ({ stdout: String(e.stdout ?? e.stderr ?? '') }));
            return send(res, 200, { output: stdout });
          }
          return send(res, 404, { error: 'not-found' });
        } catch (e) {
          const err = e as Error & { status?: number };
          return send(res, err.status ?? 500, { error: err.message });
        }
      });
    },
  };
}
