import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ROOT = path.resolve(__dirname, '../..');

/** Dev only: serve pack folders straight from the repo so authors see changes on reload. */
function servePacks(): Plugin {
  return {
    name: 'rihla-packs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        if (!url.startsWith('/packs/')) return next();
        const rel = url.slice('/packs/'.length);
        if (rel.includes('..')) return next();
        for (const base of [path.join(ROOT, 'dist/packs'), path.join(ROOT, 'packs')]) {
          const file = path.join(base, rel);
          if (existsSync(file) && statSync(file).isFile()) {
            res.setHeader('content-type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream');
            res.setHeader('cache-control', 'no-cache');
            createReadStream(file).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [servePacks()],
  resolve: {
    alias: {
      '@rihla/engine': path.join(ROOT, 'packages/engine/src/index.ts'),
      '@rihla/i18n': path.join(ROOT, 'packages/i18n/src/index.ts'),
      '@rihla/pack-schema/runtime': path.join(ROOT, 'packages/pack-schema/src/runtime.ts'),
    },
  },
  server: {
    proxy: { '/api': { target: process.env.RIHLA_API ?? 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') }, '/rooms': { target: process.env.RIHLA_ROOMS ?? 'ws://localhost:2567', ws: true } },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
