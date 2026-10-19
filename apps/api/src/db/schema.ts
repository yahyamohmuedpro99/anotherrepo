// Drizzle table definitions. They mirror migrations/*.sql, which are the source of truth for the database;
// test/schema.test.ts checks the two agree.
import { bigserial, boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'school' | 'publisher' | 'platform'>().notNull(),
  name: text('name').notNull(),
  region: text('region').notNull().default('eg'),
  retentionDays: integer('retention_days').notNull().default(365),
  seats: integer('seats').notNull().default(0),
  contractStart: date('contract_start'),
  contractEnd: date('contract_end'),
  consentRequired: boolean('consent_required').notNull().default(true),
  createdAt: created(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  locale: text('locale').notNull().default('ar-EG'),
  disabledAt: ts('disabled_at'),
  createdAt: created(),
});

export type Role = 'teacher' | 'school_admin' | 'publisher_admin' | 'author' | 'reviewer' | 'platform_admin';
export const ROLES: Role[] = ['teacher', 'school_admin', 'publisher_admin', 'author', 'reviewer', 'platform_admin'];

export const memberships = pgTable(
  'memberships',
  {
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    role: text('role').$type<Role>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId, t.role] })],
);

export const invites = pgTable('invites', {
  tokenHash: text('token_hash').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<Role>().notNull(),
  invitedBy: text('invited_by'),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
});

export const refreshTokens = pgTable('refresh_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: created(),
});

export const classes = pgTable('classes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  grade: text('grade'),
  teacherId: text('teacher_id').notNull(),
  joinCode: text('join_code').notNull(),
  namePolicy: text('name_policy').$type<'list' | 'typed'>().notNull().default('list'),
  chatAllowed: boolean('chat_allowed').notNull().default(false),
  archivedAt: ts('archived_at'),
  createdAt: created(),
});

export const students = pgTable('students', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  classId: text('class_id').notNull(),
  displayName: text('display_name').notNull(),
  nameStatus: text('name_status').$type<'approved' | 'pending' | 'rejected'>().notNull().default('approved'),
  createdAt: created(),
  lastSeenAt: ts('last_seen_at'),
});

export const consentRecords = pgTable('consent_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  studentId: text('student_id').notNull(),
  kind: text('kind').notNull().default('parental'),
  givenBy: text('given_by').notNull(),
  evidence: text('evidence').notNull(),
  recordedBy: text('recorded_by').notNull(),
  recordedAt: ts('recorded_at').notNull().defaultNow(),
  withdrawnAt: ts('withdrawn_at'),
});

export interface Localized {
  [locale: string]: string;
}

export const packs = pgTable('packs', {
  id: text('id').primaryKey(),
  title: jsonb('title').$type<Localized>().notNull(),
  summary: jsonb('summary').$type<Localized>().notNull(),
  subjects: text('subjects').array().notNull().default([]),
  grades: text('grades').array().notNull().default([]),
  durationMinutes: integer('duration_minutes').notNull().default(15),
  currentVersion: text('current_version'),
  createdAt: created(),
});

export interface PackObjective {
  id: string;
  text: Localized;
}
export const packVersions = pgTable(
  'pack_versions',
  {
    packId: text('pack_id').notNull(),
    version: text('version').notNull(),
    hash: text('hash').notNull(),
    bundlePath: text('bundle_path').notNull(),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    items: jsonb('items').$type<Record<string, { objectives: string[]; prompt: Localized; correct: Localized | null }>>().notNull().default({}),
    objectives: jsonb('objectives').$type<PackObjective[]>().notNull().default([]),
    pois: jsonb('pois').$type<{ id: string; title: Localized; scene: string }[]>().notNull().default([]),
    status: text('status').$type<'published' | 'retired'>().notNull().default('published'),
    publishedBy: text('published_by'),
    publishedAt: ts('published_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.packId, t.version] })],
);

export const packReviews = pgTable('pack_reviews', {
  id: text('id').primaryKey(),
  packId: text('pack_id').notNull(),
  version: text('version').notNull(),
  aspect: text('aspect').$type<'content' | 'language' | 'culture'>().notNull(),
  state: text('state').$type<'draft' | 'in-review' | 'changes-requested' | 'approved' | 'published'>().notNull(),
  comment: text('comment').notNull().default(''),
  country: text('country'),
  byUser: text('by_user'),
  at: ts('at').notNull().defaultNow(),
});

export const assignments = pgTable('assignments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  classId: text('class_id').notNull(),
  packId: text('pack_id').notNull(),
  packVersion: text('pack_version').notNull(),
  poiId: text('poi_id'),
  dueAt: ts('due_at'),
  attemptsAllowed: integer('attempts_allowed').notNull().default(3),
  hints: boolean('hints').notNull().default(true),
  preQuiz: boolean('pre_quiz').notNull().default(false),
  postQuiz: boolean('post_quiz').notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdAt: created(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  studentId: text('student_id'),
  ts: ts('ts').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  verb: text('verb').notNull(),
  packId: text('pack_id').notNull(),
  packVersion: text('pack_version').notNull(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id').notNull(),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull(),
  assignmentId: text('assignment_id'),
  sessionId: text('session_id'),
  processedAt: ts('processed_at'),
});

export const packDailyCounts = pgTable(
  'pack_daily_counts',
  { day: date('day').notNull(), packId: text('pack_id').notNull(), verb: text('verb').notNull(), n: integer('n').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.day, t.packId, t.verb] })],
);

export const itemResults = pgTable(
  'item_results',
  {
    tenantId: text('tenant_id').notNull(),
    assignmentId: text('assignment_id').notNull(),
    studentId: text('student_id').notNull(),
    itemId: text('item_id').notNull(),
    phase: text('phase').notNull().default('play'),
    attempts: integer('attempts').notNull().default(0),
    correct: boolean('correct').notNull().default(false),
    firstTry: boolean('first_try').notNull().default(false),
    hints: integer('hints').notNull().default(0),
    wrongResponses: jsonb('wrong_responses').$type<string[]>().notNull().default([]),
    durationMs: integer('duration_ms').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.studentId, t.itemId, t.phase] })],
);

export const objectiveResults = pgTable(
  'objective_results',
  {
    tenantId: text('tenant_id').notNull(),
    assignmentId: text('assignment_id').notNull(),
    studentId: text('student_id').notNull(),
    objectiveId: text('objective_id').notNull(),
    phase: text('phase').notNull().default('play'),
    items: integer('items').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.studentId, t.objectiveId, t.phase] })],
);

export const studentProgress = pgTable(
  'student_progress',
  {
    tenantId: text('tenant_id').notNull(),
    assignmentId: text('assignment_id').notNull(),
    studentId: text('student_id').notNull(),
    firstAt: ts('first_at').notNull(),
    lastAt: ts('last_at').notNull(),
    activeMs: integer('active_ms').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    stamps: integer('stamps').notNull().default(0),
    pois: integer('pois').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.studentId] })],
);

export const liveSessions = pgTable('live_sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  classId: text('class_id').notNull(),
  assignmentId: text('assignment_id'),
  teacherId: text('teacher_id').notNull(),
  status: text('status').$type<'active' | 'ended'>().notNull().default('active'),
  chatEnabled: boolean('chat_enabled').notNull().default(false),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
});

export const moderationLog = pgTable('moderation_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sessionId: text('session_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  at: ts('at').notNull().defaultNow(),
});

export const books = pgTable('books', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  isbn: text('isbn'),
  country: text('country').notNull().default('EG'),
  grade: text('grade'),
  subject: text('subject'),
  createdAt: created(),
});
export const bookPages = pgTable('book_pages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  bookId: text('book_id').notNull(),
  chapter: text('chapter').notNull(),
  page: text('page').notNull(),
  label: text('label').notNull().default(''),
});
export const pageLinks = pgTable('page_links', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pageId: text('page_id').notNull(),
  packId: text('pack_id').notNull(),
  poiId: text('poi_id').notNull(),
  createdAt: created(),
});
export type CodeType = 'public' | 'book' | 'copy';
export const qrBatches = pgTable('qr_batches', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pageLinkId: text('page_link_id'),
  type: text('type').$type<CodeType>().notNull(),
  count: integer('count').notNull(),
  createdBy: text('created_by'),
  createdAt: created(),
});
export const qrCodes = pgTable('qr_codes', {
  code: text('code').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  batchId: text('batch_id'),
  type: text('type').$type<CodeType>().notNull(),
  packId: text('pack_id').notNull(),
  poiId: text('poi_id'),
  pageLinkId: text('page_link_id'),
  activatedDevice: text('activated_device'),
  activatedAt: ts('activated_at'),
  disabledAt: ts('disabled_at'),
  createdAt: created(),
});
export const codeDailyCounts = pgTable(
  'code_daily_counts',
  { code: text('code').notNull(), day: date('day').notNull(), scans: integer('scans').notNull().default(0), completions: integer('completions').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.code, t.day] })],
);

export const dataRequests = pgTable('data_requests', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  subjectKind: text('subject_kind').$type<'student' | 'class' | 'tenant'>().notNull(),
  subjectId: text('subject_id').notNull(),
  kind: text('kind').$type<'export' | 'delete'>().notNull(),
  status: text('status').$type<'queued' | 'done' | 'failed'>().notNull().default('queued'),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  requestedBy: text('requested_by').notNull(),
  createdAt: created(),
  doneAt: ts('done_at'),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: text('tenant_id'),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  at: ts('at').notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  runAt: ts('run_at').notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  lockedAt: ts('locked_at'),
  lockedBy: text('locked_by'),
  doneAt: ts('done_at'),
  error: text('error'),
  dedupeKey: text('dedupe_key'),
  createdAt: created(),
});
