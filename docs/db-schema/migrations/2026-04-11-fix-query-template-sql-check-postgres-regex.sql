-- Fix SELECT/WITH check: PostgreSQL regex uses \y for word boundaries, not \b.
-- Date: 2026-04-11
-- Idempotent for Supabase SQL Editor. Run if 2026-04-10 migration already applied.

ALTER TABLE public.database_connection_query_templates
  DROP CONSTRAINT IF EXISTS chk_db_conn_query_templates_select_only;

ALTER TABLE public.database_connection_query_templates
  ADD CONSTRAINT chk_db_conn_query_templates_select_only
  CHECK (sql_text ~* '^\s*(select|with)\y');
