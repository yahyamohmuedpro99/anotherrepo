import type { Tx } from '../db/client.js';
import { auditLog } from '../db/schema.js';

/** Every admin action, moderation step and staff data access leaves an audit entry (BRIEF §11). */
export async function audit(tx: Tx, e: { tenantId?: string | null; actorId?: string | null; action: string; target?: string | null; detail?: Record<string, unknown> }): Promise<void> {
  await tx.insert(auditLog).values({ tenantId: e.tenantId ?? null, actorId: e.actorId ?? null, action: e.action, target: e.target ?? null, detail: e.detail ?? {} });
}
