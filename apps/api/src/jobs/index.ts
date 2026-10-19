import type { Database } from '../db/client.js';
import { aggregateEvents } from './aggregate.js';
import { processDataRequest, runRetention } from './compliance.js';
import { enqueue, type JobHandler } from './queue.js';

export { aggregateEvents, processDataRequest, runRetention, enqueue };
export { runOne, drain, pendingJobs } from './queue.js';

export const handlers: Record<string, JobHandler> = {
  aggregate: async (db) => void (await aggregateEvents(db)),
  'data-request': processDataRequest,
  retention: async (db) => void (await runRetention(db)),
};

/** Recurring jobs the worker keeps scheduled (one pending instance each). */
export async function scheduleRecurring(database: Database): Promise<void> {
  await database.system(async (tx) => {
    await enqueue(tx, 'aggregate', {}, { dedupeKey: 'aggregate', runAt: new Date(Date.now() + 60_000) });
    await enqueue(tx, 'retention', {}, { dedupeKey: 'retention', runAt: new Date(Date.now() + 6 * 3600_000) });
  });
}
