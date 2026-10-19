import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { studioFs } from './studio-fs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), studioFs()],
  resolve: {
    // exact-match aliases: the engine imports the runtime subset; the Studio also needs the full schema
    alias: [
      { find: /^@rihla\/engine$/, replacement: r('../../packages/engine/src/index.ts') },
      { find: /^@rihla\/i18n$/, replacement: r('../../packages/i18n/src/index.ts') },
      { find: /^@rihla\/pack-schema\/runtime$/, replacement: r('../../packages/pack-schema/src/runtime.ts') },
      { find: /^@rihla\/pack-schema\/full$/, replacement: r('../../packages/pack-schema/src/index.ts') },
      { find: /^@rihla\/pack-schema$/, replacement: r('../../packages/pack-schema/src/runtime.ts') },
    ],
  },
  server: {
    port: 5174,
    proxy: { '/api': { target: process.env.RIHLA_API ?? 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
