-- Non-relational (e.g. MongoDB) query templates: query_kind + query_body JSONB
-- Date: 2026-04-12
-- Idempotent for Supabase SQL Editor.
-- Prerequisites: 2026-04-10 (templates table), 2026-04-11 (SQL regex fix).
--
-- Relational templates: query_kind = 'sql', sql_text holds SELECT/WITH, query_body IS NULL.
-- Non-relational: query_kind = 'mongo_json', sql_text = '' (empty), query_body holds the query document (JSON object).

-- ============================================================
-- 1) COLUMNS
-- ============================================================

ALTER TABLE public.database_connection_query_templates
  ADD COLUMN IF NOT EXISTS query_kind text NOT NULL DEFAULT 'sql',
  ADD COLUMN IF NOT EXISTS query_body jsonb;

UPDATE public.database_connection_query_templates
SET query_kind = 'sql'
WHERE query_kind IS NULL OR btrim(query_kind) = '';

-- ============================================================
-- 2) DROP legacy CHECKs that apply to all rows (block mongo empty sql_text)
-- ============================================================

ALTER TABLE public.database_connection_query_templates
  DROP CONSTRAINT IF EXISTS chk_db_conn_query_templates_sql_nonempty;

ALTER TABLE public.database_connection_query_templates
  DROP CONSTRAINT IF EXISTS chk_db_conn_query_templates_select_only;

-- ============================================================
-- 3) NEW CHECKs
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_db_conn_query_templates_query_kind'
      AND conrelid = 'public.database_connection_query_templates'::regclass
  ) THEN
    ALTER TABLE public.database_connection_query_templates
      ADD CONSTRAINT chk_db_conn_query_templates_query_kind
      CHECK (query_kind IN ('sql', 'mongo_json'));
  END IF;
END $$;

-- SQL templates: non-empty read-only SELECT/WITH (PostgreSQL \y word boundary)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_db_conn_query_templates_sql_kind_body'
      AND conrelid = 'public.database_connection_query_templates'::regclass
  ) THEN
    ALTER TABLE public.database_connection_query_templates
      ADD CONSTRAINT chk_db_conn_query_templates_sql_kind_body
      CHECK (
        query_kind <> 'sql'
        OR (
          char_length(btrim(sql_text)) > 0
          AND sql_text ~* '^\s*(select|with)\y'
        )
      );
  END IF;
END $$;

-- Mongo JSON templates: empty sql_text, non-null JSON object in query_body
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_db_conn_query_templates_mongo_kind_body'
      AND conrelid = 'public.database_connection_query_templates'::regclass
  ) THEN
    ALTER TABLE public.database_connection_query_templates
      ADD CONSTRAINT chk_db_conn_query_templates_mongo_kind_body
      CHECK (
        query_kind <> 'mongo_json'
        OR (
          btrim(sql_text) = ''
          AND query_body IS NOT NULL
          AND jsonb_typeof(query_body) = 'object'
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4) INDEX (optional filter by kind per connection)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_connection_kind
  ON public.database_connection_query_templates (connection_id, query_kind)
  WHERE is_deleted = FALSE;
