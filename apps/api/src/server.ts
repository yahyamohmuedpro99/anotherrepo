import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { restorePacks } from './lib/restore-packs.js';

const config = loadConfig();
const database = await createDatabase(config.databaseUrl);
const applied = await database.migrate();
const appRole = process.env.DB_APP_ROLE !== '0' && (await database.useAppRole());
const app = await buildApp({ database, config, logger: true });
// without the restricted role, FORCE ROW LEVEL SECURITY still applies to the owner (ADR-0021)
if (!appRole) app.log.warn('running as the database owner role: rihla_app is not available');
if (process.env.PACKS_SOURCE_DIR) await restorePacks(database, config.storageDir, process.env.PACKS_SOURCE_DIR, (m) => app.log.info(m));
if (applied.length) app.log.info({ applied }, 'migrations applied');
if (!config.production && config.databaseUrl.startsWith('pglite:')) app.log.warn('Using embedded PGlite: fine for local demos, use PostgreSQL 16 in production.');
await app.listen({ port: config.port, host: config.host });

// PGlite allows one process, so local demos run the job loop inside the API. Production runs apps/workers.
const inline = process.env.INLINE_WORKER ? process.env.INLINE_WORKER === '1' : config.databaseUrl.startsWith('pglite:');
if (inline) {
  const { handlers, runOne, scheduleRecurring } = await import('./jobs/index.js');
  app.log.info('running jobs in-process (INLINE_WORKER)');
  let last = 0;
  const tick = async () => {
    try {
      if (Date.now() - last > 30_000) {
        await scheduleRecurring(database);
        last = Date.now();
      }
      while (await runOne(database, handlers, 'inline'));
    } catch (err) {
      app.log.error(err);
    }
    setTimeout(tick, 3000).unref();
  };
  void tick();
}
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close();
    await database.close();
    process.exit(0);
  });
