-- Query templates + query mode for live database connections
-- Date: 2026-04-10
-- Idempotent migration for Supabase SQL Editor.
-- Prerequisites: public.set_updated_at(), is_org_member(), has_org_role(),
--   public.database_connections

-- ============================================================
-- 1) ALTER: database_connections.query_mode
-- ============================================================

ALTER TABLE public.database_connections
  ADD COLUMN IF NOT EXISTS query_mode text NOT NULL DEFAULT 'template_only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_database_connections_query_mode'
      AND conrelid = 'public.database_connections'::regclass
  ) THEN
    ALTER TABLE public.database_connections
      ADD CONSTRAINT chk_database_connections_query_mode
      CHECK (query_mode IN ('generated', 'template_preferred', 'template_only'));
  END IF;
END $$;

-- ============================================================
-- 2) TABLE: database_connection_query_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.database_connection_query_templates (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  connection_id     uuid        NOT NULL REFERENCES public.database_connections(id) ON DELETE CASCADE,

  name              text        NOT NULL,
  description       text        NOT NULL,
  sql_text          text        NOT NULL,
  parameter_schema  jsonb,
  is_active         boolean     NOT NULL DEFAULT TRUE,
  sort_order        integer     NOT NULL DEFAULT 0,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_db_conn_query_templates_name_nonempty
    CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT chk_db_conn_query_templates_description_nonempty
    CHECK (char_length(btrim(description)) > 0),
  CONSTRAINT chk_db_conn_query_templates_sql_nonempty
    CHECK (char_length(btrim(sql_text)) > 0),
  -- Use \y (PostgreSQL ARE word boundary). \b is not a word boundary in PostgreSQL regex.
  CONSTRAINT chk_db_conn_query_templates_select_only
    CHECK (sql_text ~* '^\s*(select|with)\y'),
  CONSTRAINT chk_db_conn_query_templates_sort_order
    CHECK (sort_order >= 0)
);

-- ============================================================
-- 3) INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_db_conn_query_templates_connection_name_active
  ON public.database_connection_query_templates (connection_id, lower(name))
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_org
  ON public.database_connection_query_templates (organization_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_connection
  ON public.database_connection_query_templates (connection_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_active
  ON public.database_connection_query_templates (connection_id, is_active)
  WHERE is_deleted = FALSE;

-- ============================================================
-- 4) TRIGGERS (updated_at)
-- ============================================================

DROP TRIGGER IF EXISTS trg_set_updated_at_database_connection_query_templates
  ON public.database_connection_query_templates;
CREATE TRIGGER trg_set_updated_at_database_connection_query_templates
  BEFORE UPDATE ON public.database_connection_query_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5) RLS
-- ============================================================

ALTER TABLE public.database_connection_query_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read database connection query templates"
  ON public.database_connection_query_templates;
CREATE POLICY "Org members can read database connection query templates"
  ON public.database_connection_query_templates FOR SELECT
  USING (is_org_member(organization_id) AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Admins can insert database connection query templates"
  ON public.database_connection_query_templates;
CREATE POLICY "Admins can insert database connection query templates"
  ON public.database_connection_query_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can update database connection query templates"
  ON public.database_connection_query_templates;
CREATE POLICY "Admins can update database connection query templates"
  ON public.database_connection_query_templates FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can delete database connection query templates"
  ON public.database_connection_query_templates;
CREATE POLICY "Admins can delete database connection query templates"
  ON public.database_connection_query_templates FOR DELETE
  USING (has_org_role(organization_id, 'admin'));
