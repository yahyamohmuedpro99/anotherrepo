-- Row-level security: the second guard behind the API's own tenant scoping (BRIEF §9).
-- The API runs every tenant query inside a transaction that sets rihla.tenant_id; system jobs set
-- rihla.bypass. A query that forgets both sees no tenant rows at all (fails closed).
-- Managed databases often run migrations as a non-superuser. Without CREATEROLE the role is skipped and the API
-- stays on the owner role, which FORCE ROW LEVEL SECURITY below still restricts (ADR-0021).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rihla_app') THEN
    CREATE ROLE rihla_app NOLOGIN;
  END IF;
  -- PostgreSQL 16 no longer lets a role's creator SET ROLE to it without an explicit grant
  IF NOT pg_has_role(current_user, 'rihla_app', 'SET') THEN
    EXECUTE format('GRANT rihla_app TO %I WITH SET TRUE', current_user);
  END IF;
  GRANT USAGE ON SCHEMA public TO rihla_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rihla_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rihla_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rihla_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rihla_app;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'rihla_app role not available (%); relying on FORCE ROW LEVEL SECURITY for the owner', SQLERRM;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['classes','students','consent_records','assignments','events','item_results','objective_results',
    'student_progress','live_sessions','moderation_log','books','book_pages','page_links','qr_batches','qr_codes','data_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING (
      current_setting('rihla.bypass', true) = 'on' OR tenant_id = current_setting('rihla.tenant_id', true))
      WITH CHECK (current_setting('rihla.bypass', true) = 'on' OR tenant_id = current_setting('rihla.tenant_id', true))$p$, t);
  END LOOP;
END $$;

