-- Secrets an instance generated for itself when none were configured (serverless demo hosts, ADR-0022).
-- Only the owner role can read it: rihla_app gets no grant, so a tenant query can never reach it.
CREATE TABLE instance_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON instance_secrets FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rihla_app') THEN
    REVOKE ALL ON instance_secrets FROM rihla_app;
  END IF;
END $$;
