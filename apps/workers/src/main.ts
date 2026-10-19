/**
 * Rihla workers (BRIEF §3, §9). Any number of these can run: jobs are claimed with SKIP LOCKED.
 *   pnpm --filter @rihla/workers start        # loop forever
 *   pnpm --filter @rihla/workers once         # drain the queue and exit (cron, CI)
 */
import { hostname } from 'node:os';
import { createDatabase, loadConfig } from '@rihla/api';
import { drain, handlers, runOne, scheduleRecurring } from '@rihla/api/jobs';

const config = loadConfig();
const database = await createDatabase(config.databaseUrl);
await database.migrate();
if (process.env.DB_APP_ROLE !== '0') await database.useAppRole();
const id = `${hostname()}:${process.pid}`;
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: id, msg, ...extra }));

if (process.argv.includes('--once')) {
  const n = await drain(database, handlers);
  log('drained', { jobs: n });
  await database.close();
  process.exit(0);
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    stopping = true;
  });

log('started');
let lastSchedule = 0;
while (!stopping) {
  try {
    if (Date.now() - lastSchedule > 30_000) {
      await scheduleRecurring(database);
      lastSchedule = Date.now();
    }
    const worked = await runOne(database, handlers, id);
    if (!worked) await new Promise((r) => setTimeout(r, 2000));
  } catch (err) {
    log('error', { error: String((err as Error).message) });
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await database.close();
log('stopped');
