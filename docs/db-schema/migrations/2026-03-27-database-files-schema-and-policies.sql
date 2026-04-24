-- Database files (schema/data) support for RAG + tools
-- Date: 2026-03-27
-- Idempotent migration for Supabase SQL Editor.

-- ============================================================
-- 1) ALTER EXISTING TABLES
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_db_schema_file boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_db_data_file boolean NOT NULL DEFAULT FALSE;

-- A document cannot be both schema-file and data-file at the same time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_documents_db_file_flags'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT chk_documents_db_file_flags
      CHECK (NOT (is_db_schema_file AND is_db_data_file));
  END IF;
END;
$$;

-- ============================================================
-- 2) LOOKUP TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_db_file_purposes (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_purpose  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_db_file_purposes UNIQUE (file_purpose)
);

CREATE TABLE IF NOT EXISTS public.document_db_file_allowed_extensions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_extension  text        NOT NULL,
  file_for        uuid        NOT NULL REFERENCES public.document_db_file_purposes(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_db_file_allowed_extensions UNIQUE (file_extension, file_for)
);

-- Seed lookup rows
INSERT INTO public.document_db_file_purposes (file_purpose)
VALUES
  ('db-schema-file'),
  ('data-file')
ON CONFLICT (file_purpose) DO NOTHING;

INSERT INTO public.document_db_file_allowed_extensions (file_extension, file_for)
VALUES
  ('sql',  (SELECT id FROM public.document_db_file_purposes WHERE file_purpose = 'db-schema-file')),
  ('json', (SELECT id FROM public.document_db_file_purposes WHERE file_purpose = 'data-file'))
ON CONFLICT (file_extension, file_for) DO NOTHING;

-- ============================================================
-- 3) CORE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_database_schemas (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id  uuid        NOT NULL REFERENCES public.project_agents(id),
  document_id       uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,

  source_type_id    uuid        NOT NULL REFERENCES public.document_db_file_purposes(id),
  database_name     text        NOT NULL,

  -- For now only .sql is allowed for schema files; raw SQL is required.
  schema_sql        text        NOT NULL,
  -- Optional normalized representation produced by parser.
  schema_snapshot   jsonb,

  table_count       integer     NOT NULL DEFAULT 0,
  checksum_sha256   text,
  status            text        NOT NULL DEFAULT 'ready',

  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_database_schemas_document UNIQUE (document_id),
  CONSTRAINT chk_document_database_schemas_status
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT chk_document_database_schemas_table_count
    CHECK (table_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.document_database_table_data (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_id          uuid        NOT NULL REFERENCES public.document_database_schemas(id) ON DELETE CASCADE,

  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id   uuid        NOT NULL REFERENCES public.project_agents(id),
  document_id        uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,

  schema_name        text        NOT NULL DEFAULT 'public',
  table_name         text        NOT NULL,
  table_data         jsonb       NOT NULL,

  row_count_estimate bigint      NOT NULL DEFAULT 0,
  payload_bytes      bigint,
  checksum_sha256    text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_database_table_data UNIQUE (schema_id, schema_name, table_name),
  CONSTRAINT chk_document_database_table_data_row_count CHECK (row_count_estimate >= 0),
  CONSTRAINT chk_document_database_table_data_payload_bytes CHECK (payload_bytes IS NULL OR payload_bytes >= 0)
);

-- ============================================================
-- 4) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_document_db_file_allowed_extensions_file_for
  ON public.document_db_file_allowed_extensions (file_for);

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_org
  ON public.document_database_schemas (organization_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_project_agent
  ON public.document_database_schemas (project_agent_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_source_type
  ON public.document_database_schemas (source_type_id);

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_status
  ON public.document_database_schemas (status)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_document_database_table_data_schema
  ON public.document_database_table_data (schema_id);

CREATE INDEX IF NOT EXISTS idx_document_database_table_data_org
  ON public.document_database_table_data (organization_id);

CREATE INDEX IF NOT EXISTS idx_document_database_table_data_project_agent
  ON public.document_database_table_data (project_agent_id);

-- Optional: enable only if jsonb filtering on table_data becomes common.
-- CREATE INDEX IF NOT EXISTS idx_document_database_table_data_jsonb_gin
--   ON public.document_database_table_data USING gin (table_data jsonb_path_ops);

-- ============================================================
-- 5) TRIGGERS (updated_at)
-- ============================================================

DROP TRIGGER IF EXISTS trg_set_updated_at_document_db_file_purposes ON public.document_db_file_purposes;
CREATE TRIGGER trg_set_updated_at_document_db_file_purposes
  BEFORE UPDATE ON public.document_db_file_purposes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_document_db_file_allowed_extensions ON public.document_db_file_allowed_extensions;
CREATE TRIGGER trg_set_updated_at_document_db_file_allowed_extensions
  BEFORE UPDATE ON public.document_db_file_allowed_extensions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_document_database_schemas ON public.document_database_schemas;
CREATE TRIGGER trg_set_updated_at_document_database_schemas
  BEFORE UPDATE ON public.document_database_schemas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_document_database_table_data ON public.document_database_table_data;
CREATE TRIGGER trg_set_updated_at_document_database_table_data
  BEFORE UPDATE ON public.document_database_table_data
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6) RLS POLICIES
-- ============================================================

ALTER TABLE public.document_db_file_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_db_file_allowed_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_database_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_database_table_data ENABLE ROW LEVEL SECURITY;

-- Public/authenticated read for lookup rows only.
DROP POLICY IF EXISTS "Authenticated users can read document db file purposes"
  ON public.document_db_file_purposes;
CREATE POLICY "Authenticated users can read document db file purposes"
  ON public.document_db_file_purposes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read document db file allowed extensions"
  ON public.document_db_file_allowed_extensions;
CREATE POLICY "Authenticated users can read document db file allowed extensions"
  ON public.document_db_file_allowed_extensions FOR SELECT
  TO authenticated
  USING (true);

-- document_database_schemas
DROP POLICY IF EXISTS "Org members can read database schemas"
  ON public.document_database_schemas;
CREATE POLICY "Org members can read database schemas"
  ON public.document_database_schemas FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins can insert database schemas"
  ON public.document_database_schemas;
CREATE POLICY "Admins can insert database schemas"
  ON public.document_database_schemas FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.id = document_id
        AND d.organization_id = organization_id
        AND d.project_agent_id = project_agent_id
        AND d.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can update database schemas"
  ON public.document_database_schemas;
CREATE POLICY "Admins can update database schemas"
  ON public.document_database_schemas FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

DROP POLICY IF EXISTS "Admins can delete database schemas"
  ON public.document_database_schemas;
CREATE POLICY "Admins can delete database schemas"
  ON public.document_database_schemas FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- document_database_table_data
DROP POLICY IF EXISTS "Org members can read database table data"
  ON public.document_database_table_data;
CREATE POLICY "Org members can read database table data"
  ON public.document_database_table_data FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins can insert database table data"
  ON public.document_database_table_data;
CREATE POLICY "Admins can insert database table data"
  ON public.document_database_table_data FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.document_database_schemas s
      WHERE s.id = schema_id
        AND s.organization_id = organization_id
        AND s.project_agent_id = project_agent_id
        AND s.document_id = document_id
        AND s.is_deleted = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins can update database table data"
  ON public.document_database_table_data;
CREATE POLICY "Admins can update database table data"
  ON public.document_database_table_data FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

DROP POLICY IF EXISTS "Admins can delete database table data"
  ON public.document_database_table_data;
CREATE POLICY "Admins can delete database table data"
  ON public.document_database_table_data FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- ============================================================
-- 7) SUPABASE STORAGE POLICIES (NEW BUCKETS)
-- ============================================================
-- Object path convention (same as documents-storage):
--   {organization_id}/{project_id}/{agent_id}/{file_name}
-- Dump path convention:
--   {organization_id}/{project_id}/{agent_id}/{document_id}__{file_name}

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- ---------- database-files-storage ----------
DROP POLICY IF EXISTS "Org members can read database files storage" ON storage.objects;
CREATE POLICY "Org members can read database files storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'database-files-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

DROP POLICY IF EXISTS "Org members can upload database files storage" ON storage.objects;
CREATE POLICY "Org members can upload database files storage"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'database-files-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

DROP POLICY IF EXISTS "Org members can update database files storage" ON storage.objects;
CREATE POLICY "Org members can update database files storage"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'database-files-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'database-files-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

DROP POLICY IF EXISTS "Org members can delete database files storage" ON storage.objects;
CREATE POLICY "Org members can delete database files storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'database-files-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

-- ---------- database-files-dump ----------
DROP POLICY IF EXISTS "Org members can read database files dump" ON storage.objects;
CREATE POLICY "Org members can read database files dump"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'database-files-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

DROP POLICY IF EXISTS "Org members can upload database files dump" ON storage.objects;
CREATE POLICY "Org members can upload database files dump"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'database-files-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

DROP POLICY IF EXISTS "Org members can update database files dump" ON storage.objects;
CREATE POLICY "Org members can update database files dump"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'database-files-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'database-files-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

-- ============================================================
-- 8) DATABASE LOOKUPS + SCHEMA LINK
-- ============================================================

CREATE TABLE IF NOT EXISTS public.database_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_database_types_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.databases (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier        text        NOT NULL,
  name              text        NOT NULL,
  database_type_id  uuid        NOT NULL REFERENCES public.database_types(id),
  is_active         boolean     NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_databases_identifier UNIQUE (identifier)
);

-- Seed lookup rows
INSERT INTO public.database_types (name, is_active)
VALUES ('Relational', TRUE)
ON CONFLICT (name) DO UPDATE
SET is_active = EXCLUDED.is_active;

INSERT INTO public.databases (identifier, name, database_type_id, is_active)
VALUES (
  'postgresql',
  'PostgreSQL',
  (SELECT id FROM public.database_types WHERE name = 'Relational'),
  TRUE
)
ON CONFLICT (identifier) DO UPDATE
SET
  name = EXCLUDED.name,
  database_type_id = EXCLUDED.database_type_id,
  is_active = EXCLUDED.is_active;

-- Link schema records to canonical database lookup.
ALTER TABLE public.document_database_schemas
  ADD COLUMN IF NOT EXISTS database_id uuid REFERENCES public.databases(id);

-- Optional hardening: enforce presence of database_id on new inserts after backfill.
-- ALTER TABLE public.document_database_schemas
--   ALTER COLUMN database_id SET NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_databases_type
  ON public.databases (database_type_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_databases_active
  ON public.databases (is_active);

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_database_id
  ON public.document_database_schemas (database_id)
  WHERE is_deleted = FALSE;

-- Triggers
DROP TRIGGER IF EXISTS trg_set_updated_at_database_types ON public.database_types;
CREATE TRIGGER trg_set_updated_at_database_types
  BEFORE UPDATE ON public.database_types
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_databases ON public.databases;
CREATE TRIGGER trg_set_updated_at_databases
  BEFORE UPDATE ON public.databases
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE public.database_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.databases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read database types"
  ON public.database_types;
CREATE POLICY "Authenticated users can read database types"
  ON public.database_types FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Authenticated users can read databases"
  ON public.databases;
CREATE POLICY "Authenticated users can read databases"
  ON public.databases FOR SELECT
  TO authenticated
  USING (is_active = TRUE);
