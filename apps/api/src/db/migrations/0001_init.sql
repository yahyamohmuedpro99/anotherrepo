-- Rihla schema v1. Every tenant-owned row carries tenant_id; the API scopes every query by it and
-- 0002_rls.sql adds row-level security as a second guard (BRIEF §9).

CREATE TABLE tenants (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('school', 'publisher', 'platform')),
  name text NOT NULL,
  region text NOT NULL DEFAULT 'eg',
  retention_days integer NOT NULL DEFAULT 365,
  seats integer NOT NULL DEFAULT 0,
  contract_start date,
  contract_end date,
  consent_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text,
  locale text NOT NULL DEFAULT 'ar-EG',
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

CREATE TABLE memberships (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('teacher', 'school_admin', 'publisher_admin', 'author', 'reviewer', 'platform_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id, role)
);

CREATE TABLE invites (
  token_hash text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  invited_by text REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz
);

CREATE TABLE refresh_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text,
  teacher_id text NOT NULL REFERENCES users(id),
  join_code text NOT NULL UNIQUE,
  name_policy text NOT NULL DEFAULT 'list' CHECK (name_policy IN ('list', 'typed')),
  chat_allowed boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_tenant_idx ON classes (tenant_id);

-- ClassMember: a student is a display name in one class. No email, no phone (BRIEF §2).
CREATE TABLE students (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id text NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  name_status text NOT NULL DEFAULT 'approved' CHECK (name_status IN ('approved', 'pending', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
CREATE INDEX students_class_idx ON students (class_id);

CREATE TABLE consent_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'parental',
  given_by text NOT NULL,
  evidence text NOT NULL,
  recorded_by text NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);

-- Packs are global content (not personal data).
CREATE TABLE packs (
  id text PRIMARY KEY,
  title jsonb NOT NULL,
  summary jsonb NOT NULL,
  subjects text[] NOT NULL DEFAULT '{}',
  grades text[] NOT NULL DEFAULT '{}',
  duration_minutes integer NOT NULL DEFAULT 15,
  current_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pack_versions (
  pack_id text NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  version text NOT NULL,
  hash text NOT NULL,
  bundle_path text NOT NULL,
  manifest jsonb NOT NULL,
  -- item id → objective ids, so reports work without loading bundles
  items jsonb NOT NULL DEFAULT '{}',
  objectives jsonb NOT NULL DEFAULT '[]',
  pois jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'retired')),
  published_by text REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, version)
);

CREATE TABLE pack_reviews (
  id text PRIMARY KEY,
  pack_id text NOT NULL,
  version text NOT NULL,
  aspect text NOT NULL CHECK (aspect IN ('content', 'language', 'culture')),
  state text NOT NULL CHECK (state IN ('draft', 'in-review', 'changes-requested', 'approved', 'published')),
  comment text NOT NULL DEFAULT '',
  country text,
  by_user text REFERENCES users(id),
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id text NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES packs(id),
  pack_version text NOT NULL,
  poi_id text,
  due_at timestamptz,
  attempts_allowed integer NOT NULL DEFAULT 3,
  hints boolean NOT NULL DEFAULT true,
  pre_quiz boolean NOT NULL DEFAULT false,
  post_quiz boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_class_idx ON assignments (class_id);

-- Append-only learning events from students (guests are only counted, see pack_daily_counts).
CREATE TABLE events (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text REFERENCES students(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  verb text NOT NULL,
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  result jsonb,
  context jsonb NOT NULL,
  assignment_id text,
  session_id text,
  processed_at timestamptz
);
CREATE INDEX events_unprocessed_idx ON events (received_at) WHERE processed_at IS NULL;
CREATE INDEX events_assignment_idx ON events (assignment_id);

CREATE TABLE pack_daily_counts (
  day date NOT NULL,
  pack_id text NOT NULL,
  verb text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, pack_id, verb)
);

-- Aggregates (teacher dashboards read only these).
CREATE TABLE item_results (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id text NOT NULL,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  phase text NOT NULL DEFAULT 'play',
  attempts integer NOT NULL DEFAULT 0,
  correct boolean NOT NULL DEFAULT false,
  first_try boolean NOT NULL DEFAULT false,
  hints integer NOT NULL DEFAULT 0,
  wrong_responses jsonb NOT NULL DEFAULT '[]',
  duration_ms integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id, item_id, phase)
);

CREATE TABLE objective_results (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id text NOT NULL,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  objective_id text NOT NULL,
  phase text NOT NULL DEFAULT 'play',
  items integer NOT NULL DEFAULT 0,
  correct integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id, objective_id, phase)
);

CREATE TABLE student_progress (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id text NOT NULL,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  active_ms integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  stamps integer NOT NULL DEFAULT 0,
  pois integer NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE live_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id text NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assignment_id text REFERENCES assignments(id) ON DELETE SET NULL,
  teacher_id text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  chat_enabled boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE moderation_log (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

-- Publishers
CREATE TABLE books (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  isbn text,
  country text NOT NULL DEFAULT 'EG',
  grade text,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE book_pages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter text NOT NULL,
  page text NOT NULL,
  label text NOT NULL DEFAULT ''
);
CREATE TABLE page_links (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_id text NOT NULL REFERENCES book_pages(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES packs(id),
  poi_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE qr_batches (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_link_id text REFERENCES page_links(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('public', 'book', 'copy')),
  count integer NOT NULL,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The printed short slug is the code: its destination can change without reprinting (BRIEF §7).
CREATE TABLE qr_codes (
  code text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id text REFERENCES qr_batches(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('public', 'book', 'copy')),
  pack_id text NOT NULL,
  poi_id text,
  page_link_id text REFERENCES page_links(id) ON DELETE SET NULL,
  activated_device text,
  activated_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE code_daily_counts (
  code text NOT NULL,
  day date NOT NULL,
  scans integer NOT NULL DEFAULT 0,
  completions integer NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);

CREATE TABLE data_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK (subject_kind IN ('student', 'class', 'tenant')),
  subject_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('export', 'delete')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'done', 'failed')),
  result jsonb,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);

-- No foreign key on tenant_id: the audit trail outlives a deleted tenant.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  tenant_id text,
  actor_id text,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

-- Postgres-backed job queue (ADR-0006): claimed with FOR UPDATE SKIP LOCKED.
CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  locked_by text,
  done_at timestamptz,
  error text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE done_at IS NULL;
