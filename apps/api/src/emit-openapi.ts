// Writes openapi.json (consumed by packages/api-client and published with the docs).
import { writeFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const database = await createDatabase('pglite://memory');
const app = await buildApp({ database, config: loadConfig({ ...process.env, NODE_ENV: 'development' }) });
await app.ready();
const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, JSON.stringify(app.swagger(), null, 2) + '\n');
console.log(`wrote ${out.pathname}`);
await app.close();
await database.close();
