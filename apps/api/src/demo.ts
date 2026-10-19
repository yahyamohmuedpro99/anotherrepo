/** Local demo and e2e: migrate, seed once, then serve (with the in-process job loop for PGlite). */
import { createDatabase } from './db/client.js';
import { loadConfig } from './config.js';
import { seed, DEMO_PASSWORD } from './seed.js';

const config = loadConfig();
const db = await createDatabase(config.databaseUrl);
await db.migrate();
await db.useAppRole();
const r = await seed(db, config);
if (r) console.log(`seeded demo data (password ${DEMO_PASSWORD}); class code ${r.classCode}`);
await db.close();
await import('./server.js');
