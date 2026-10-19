import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const database = await createDatabase(config.databaseUrl);
const applied = await database.migrate();
if (process.env.DB_APP_ROLE !== '0') await database.useAppRole();
const app = await buildApp({ database, config, logger: true });
if (applied.length) app.log.info({ applied }, 'migrations applied');
if (!config.production && config.databaseUrl.startsWith('pglite:')) app.log.warn('Using embedded PGlite: fine for local demos, use PostgreSQL 16 in production.');
await app.listen({ port: config.port, host: config.host });
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close();
    await database.close();
    process.exit(0);
  });
