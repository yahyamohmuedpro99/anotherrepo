import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  auditLog, classes, consentRecords, dataRequests, events, invites, itemResults, liveSessions, moderationLog, objectiveResults, refreshTokens, studentProgress, students, tenants,
} from '../db/schema.js';

/** Everything we hold about the students covered by a request. */
async function collect(database: Database, tenantId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  return database.tenant(tenantId, async (tx) => {
    const out = [];
    for (const id of studentIds) {
      const [s] = await tx.select().from(students).where(eq(students.id, id));
      if (!s) continue;
      out.push({
        student: s,
        consent: await tx.select().from(consentRecords).where(eq(consentRecords.studentId, id)),
        progress: await tx.select().from(studentProgress).where(eq(studentProgress.studentId, id)),
        items: await tx.select().from(itemResults).where(eq(itemResults.studentId, id)),
        objectives: await tx.select().from(objectiveResults).where(eq(objectiveResults.studentId, id)),
        events: await tx.select().from(events).where(eq(events.studentId, id)),
      });
    }
    return out;
  });
}

async function studentsOf(database: Database, tenantId: string, kind: string, subjectId: string): Promise<string[]> {
  return database.tenant(tenantId, async (tx) => {
    if (kind === 'student') return [subjectId];
    if (kind === 'class') return (await tx.select({ id: students.id }).from(students).where(eq(students.classId, subjectId))).map((r) => r.id);
    return (await tx.select({ id: students.id }).from(students)).map((r) => r.id);
  });
}

/** Export or delete a student, a class roster, or a whole tenant (BRIEF §11). */
export async function processDataRequest(database: Database, payload: Record<string, unknown>): Promise<void> {
  const id = String(payload.id);
  const [req] = await database.system((tx) => tx.select().from(dataRequests).where(eq(dataRequests.id, id)));
  if (!req || req.status !== 'queued') return;
  const ids = await studentsOf(database, req.tenantId, req.subjectKind, req.subjectId);
  if (req.kind === 'export') {
    const data = await collect(database, req.tenantId, ids);
    await database.system((tx) => tx.update(dataRequests).set({ status: 'done', doneAt: new Date(), result: { exportedAt: new Date().toISOString(), students: data } }).where(eq(dataRequests.id, id)));
    return;
  }
  if (req.subjectKind === 'tenant') {
    // The audit trail and the request record outlive the tenant; everything else cascades.
    await database.system(async (tx) => {
      await tx.insert(auditLog).values({ tenantId: req.tenantId, actorId: req.requestedBy, action: 'tenant.deleted', target: req.tenantId, detail: { students: ids.length } });
      await tx.update(dataRequests).set({ status: 'done', doneAt: new Date(), result: { deletedStudents: ids.length } }).where(eq(dataRequests.id, id));
      await tx.execute(sql`DELETE FROM data_requests WHERE tenant_id = ${req.tenantId} AND id <> ${id}`);
      await tx.delete(tenants).where(eq(tenants.id, req.tenantId));
    });
    return;
  }
  await database.tenant(req.tenantId, async (tx) => {
    if (ids.length) {
      // events, results, progress and consent cascade from students
      await tx.delete(students).where(inArray(students.id, ids));
    }
    if (req.subjectKind === 'class') await tx.delete(classes).where(eq(classes.id, req.subjectId));
    await tx.update(dataRequests).set({ status: 'done', doneAt: new Date(), result: { deletedStudents: ids.length } }).where(eq(dataRequests.id, id));
  });
  await database.system((tx) => tx.insert(auditLog).values({ tenantId: req.tenantId, actorId: req.requestedBy, action: `data.deleted.${req.subjectKind}`, target: req.subjectId, detail: { students: ids.length } }));
}

/** Retention: raw events per tenant contract, moderation logs 30 days, expired tokens and invites. */
export async function runRetention(database: Database): Promise<{ events: number; moderation: number }> {
  return database.system(async (tx) => {
    const ts = await tx.select({ id: tenants.id, days: tenants.retentionDays }).from(tenants);
    let ev = 0;
    for (const t of ts) {
      const cut = new Date(Date.now() - t.days * 864e5);
      ev += (await tx.delete(events).where(and(eq(events.tenantId, t.id), lt(events.receivedAt, cut))).returning({ id: events.id })).length;
    }
    const mod = (await tx.delete(moderationLog).where(lt(moderationLog.at, new Date(Date.now() - 30 * 864e5))).returning({ id: moderationLog.id })).length;
    await tx.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    await tx.delete(invites).where(lt(invites.expiresAt, new Date(Date.now() - 30 * 864e5)));
    // sessions left open by a closed laptop end after 90 minutes
    await tx.update(liveSessions).set({ status: 'ended', endedAt: new Date() }).where(and(eq(liveSessions.status, 'active'), lt(liveSessions.startedAt, new Date(Date.now() - 90 * 60_000))));
    return { events: ev, moderation: mod };
  });
}
