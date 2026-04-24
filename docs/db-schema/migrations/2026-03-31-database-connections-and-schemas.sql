-- Live database connections (MySQL) + introspected schema snapshots
-- Date: 2026-03-31
-- Idempotent migration for Supabase SQL Editor.
-- Prerequisites: public.set_updated_at(), is_org_member(), has_org_role(),
--   public.database_types, public.databases (Relational type seeded in 2026-03-27 migration).
--
-- Referenced from: docs/db-schema/sql-queries.md (add a line under incremental migrations when updating that doc).

-- ============================================================
-- 1) TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.database_connections (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id  uuid        NOT NULL REFERENCES public.project_agents(id) ON DELETE CASCADE,
  database_type_id  uuid        NOT NULL REFERENCES public.database_types(id),
  database_id       uuid        REFERENCES public.databases(id),

  display_name      text        NOT NULL,
  host              text        NOT NULL,
  port              integer     NOT NULL DEFAULT 3306,
  database_name   text        NOT NULL,
  username          text        NOT NULL,

  ssl_mode          text        NOT NULL DEFAULT 'required',

  status            text        NOT NULL DEFAULT 'pending',
  last_tested_at    timestamptz,
  last_error        text,
  last_introspected_at timestamptz,

  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_database_connections_port
    CHECK (port > 0 AND port <= 65535),
  CONSTRAINT chk_database_connections_ssl_mode
    CHECK (ssl_mode IN ('disable', 'preferred', 'required', 'verify_ca', 'verify_identity')),
  CONSTRAINT chk_database_connections_status
    CHECK (status IN ('pending', 'connected', 'failed', 'disconnected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_database_connections_pa_display_active
  ON public.database_connections (project_agent_id, display_name)
  WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS public.database_connection_secrets (
  connection_id     uuid        NOT NULL PRIMARY KEY REFERENCES public.database_connections(id) ON DELETE CASCADE,
  password_value      text        NOT NULL,
  ssl_ca_pem          text
);

CREATE TABLE IF NOT EXISTS public.database_connection_schemas (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id     uuid        NOT NULL REFERENCES public.database_connections(id) ON DELETE CASCADE,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),

  schema_snapshot   jsonb       NOT NULL,
  table_count       integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'ready',
  fetched_at        timestamptz NOT NULL DEFAULT now(),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_database_connection_schemas_connection UNIQUE (connection_id),
  CONSTRAINT chk_database_connection_schemas_status
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT chk_database_connection_schemas_table_count CHECK (table_count >= 0)
);

-- ============================================================
-- 2) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_database_connections_org
  ON public.database_connections (organization_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_database_connections_project_agent
  ON public.database_connections (project_agent_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_database_connections_status
  ON public.database_connections (status)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_org
  ON public.database_connection_schemas (organization_id);

CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_connection
  ON public.database_connection_schemas (connection_id);

-- ============================================================
-- 3) TRIGGERS (updated_at)
-- ============================================================

DROP TRIGGER IF EXISTS trg_set_updated_at_database_connections ON public.database_connections;
CREATE TRIGGER trg_set_updated_at_database_connections
  BEFORE UPDATE ON public.database_connections
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_database_connection_schemas ON public.database_connection_schemas;
CREATE TRIGGER trg_set_updated_at_database_connection_schemas
  BEFORE UPDATE ON public.database_connection_schemas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4) RLS
-- ============================================================

ALTER TABLE public.database_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_connection_schemas ENABLE ROW LEVEL SECURITY;

-- database_connections
DROP POLICY IF EXISTS "Org members can read database connections"
  ON public.database_connections;
CREATE POLICY "Org members can read database connections"
  ON public.database_connections FOR SELECT
  USING (is_org_member(organization_id) AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Admins can insert database connections"
  ON public.database_connections;
CREATE POLICY "Admins can insert database connections"
  ON public.database_connections FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND p.organization_id = organization_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can update database connections"
  ON public.database_connections;
CREATE POLICY "Admins can update database connections"
  ON public.database_connections FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

DROP POLICY IF EXISTS "Admins can delete database connections"
  ON public.database_connections;
CREATE POLICY "Admins can delete database connections"
  ON public.database_connections FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- database_connection_secrets: no policies for authenticated — only service_role (bypasses RLS).

-- database_connection_schemas
DROP POLICY IF EXISTS "Org members can read database connection schemas"
  ON public.database_connection_schemas;
CREATE POLICY "Org members can read database connection schemas"
  ON public.database_connection_schemas FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins can insert database connection schemas"
  ON public.database_connection_schemas;
CREATE POLICY "Admins can insert database connection schemas"
  ON public.database_connection_schemas FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can update database connection schemas"
  ON public.database_connection_schemas;
CREATE POLICY "Admins can update database connection schemas"
  ON public.database_connection_schemas FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

DROP POLICY IF EXISTS "Admins can delete database connection schemas"
  ON public.database_connection_schemas;
CREATE POLICY "Admins can delete database connection schemas"
  ON public.database_connection_schemas FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- ============================================================
-- 5) SEED: MySQL product row
-- ============================================================

INSERT INTO public.databases (identifier, name, database_type_id, is_active)
VALUES (
  'mysql',
  'MySQL',
  (SELECT id FROM public.database_types WHERE name = 'Relational' LIMIT 1),
  TRUE
)
ON CONFLICT (identifier) DO UPDATE SET
  name = EXCLUDED.name,
  database_type_id = EXCLUDED.database_type_id,
  is_active = EXCLUDED.is_active;
