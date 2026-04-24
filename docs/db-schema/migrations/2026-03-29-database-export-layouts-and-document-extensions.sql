-- Database export layouts lookup + document_allowed_extensions timestamps + FK on document_database_schemas
-- Date: 2026-03-29
-- Idempotent migration for Supabase SQL Editor.
-- Prerequisites: public.set_updated_at() exists (see docs/db-schema/sql-queries.md).

-- ============================================================
-- 1) LOOKUP: public.database_export_layouts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.database_export_layouts (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  format      text        NOT NULL,
  platform    text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_database_export_layouts_format_platform UNIQUE (format, platform)
);

CREATE INDEX IF NOT EXISTS idx_database_export_layouts_active
  ON public.database_export_layouts (is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_database_export_layouts_format
  ON public.database_export_layouts (format);

DROP TRIGGER IF EXISTS trg_set_updated_at_database_export_layouts ON public.database_export_layouts;
CREATE TRIGGER trg_set_updated_at_database_export_layouts
  BEFORE UPDATE ON public.database_export_layouts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.database_export_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active database export layouts"
  ON public.database_export_layouts;
CREATE POLICY "Authenticated users can read active database export layouts"
  ON public.database_export_layouts FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Seed examples (idempotent)
INSERT INTO public.database_export_layouts (format, platform, is_active)
VALUES
  ('json', 'generic', TRUE),
  ('sql', 'mysql', TRUE)
ON CONFLICT (format, platform) DO NOTHING;

-- ============================================================
-- 2) ALTER: public.document_database_schemas → export layout FK
-- ============================================================

ALTER TABLE public.document_database_schemas
  ADD COLUMN IF NOT EXISTS database_export_layout_id uuid REFERENCES public.database_export_layouts(id);

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_export_layout
  ON public.document_database_schemas (database_export_layout_id)
  WHERE is_deleted = FALSE;

-- ============================================================
-- 3) ALTER: public.document_allowed_extensions → timestamps + trigger
-- ============================================================

ALTER TABLE public.document_allowed_extensions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_set_updated_at_document_allowed_extensions ON public.document_allowed_extensions;
CREATE TRIGGER trg_set_updated_at_document_allowed_extensions
  BEFORE UPDATE ON public.document_allowed_extensions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
