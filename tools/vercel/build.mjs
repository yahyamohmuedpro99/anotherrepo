// Builds the player + API Vercel project with the Build Output API (ADR-0022):
//   static/            the player shell and assets, plus built packs under /packs (immutable by content hash)
//   functions/api.func the API bundled into one ESM file, with its migrations and the pack sources for seeding
// node tools/vercel/build.mjs   (Vercel runs it as the build command; it also works locally)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, '.vercel/output');
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

run('pnpm --filter @rihla/pack-schema build');
rmSync(path.join(ROOT, 'dist/packs'), { recursive: true, force: true });
run('node packages/pack-schema/dist/cli.js build packs/giza-plateau packs/solar-system --out dist/packs');
run('pnpm --filter @rihla/player build');

rmSync(OUT, { recursive: true, force: true });
const statics = path.join(OUT, 'static');
cpSync(path.join(ROOT, 'apps/player/dist'), statics, { recursive: true });
cpSync(path.join(ROOT, 'dist/packs'), path.join(statics, 'packs'), { recursive: true });

const fn = path.join(OUT, 'functions/api.func');
mkdirSync(fn, { recursive: true });
// esbuild comes with the API's toolchain (tsx); resolve it from there rather than adding a dependency
const fromApi = createRequire(path.join(ROOT, 'apps/api/package.json'));
const esbuild = createRequire(fromApi.resolve('tsx/package.json'))('esbuild');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'apps/api/src/serverless.ts')],
  outfile: path.join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native', '@electric-sql/pglite', 'drizzle-orm/pglite'],
  define: { 'process.env.RIHLA_BUNDLED': '"1"' },
  // CommonJS dependencies inside an ESM bundle still call require()
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
cpSync(path.join(ROOT, 'apps/api/src/db/migrations'), path.join(fn, 'migrations'), { recursive: true });
cpSync(path.join(ROOT, 'packs'), path.join(fn, 'packs'), { recursive: true });
writeFileSync(path.join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60, environment: { SEED_DEMO: '1' } }, null, 2));

const immutable = { 'cache-control': 'public, max-age=31536000, immutable' };
writeFileSync(
  path.join(OUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: immutable, continue: true },
        { src: '^/packs/.+/(bundle\\.[0-9a-f]{12}\\.json|assets/.+\\.[0-9a-f]{12}\\.[a-z0-9]+)$', headers: immutable, continue: true },
        { src: '^/(packs/.+/index\\.json|sw\\.js)$', headers: { 'cache-control': 'no-cache' }, continue: true },
        { src: '^/.*$', headers: { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' }, continue: true },
        // the API and the printed short links
        { src: '^/api(/.*)?$', dest: '/api' },
        { src: '^/s/.+$', dest: '/api' },
        { handle: 'filesystem' },
        // single-page routes: /x/{pack}/{poi}, /play/{pack}, /c/{code}
        { src: '^/(?!packs/).*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Vercel build output written to ${path.relative(ROOT, OUT)}`);
