-- Add MongoDB lookup rows + schema snapshot kind/entity count columns
-- Date: 2026-04-08
-- Idempotent migration for Supabase SQL Editor.
--
-- Adds:
-- - public.database_connection_schemas.snapshot_kind ('relational' | 'document')
-- - public.database_connection_schemas.entity_count (generic count: tables/collections)
-- - supporting indexes/check constraints
-- - lookup seed rows for MongoDB in public.database_types + public.databases
--
-- Notes:
-- - Keeps existing table_count for backward compatibility.
-- - Backfills entity_count from table_count for existing rows.

-- ============================================================
-- 1) ALTER: public.database_connection_schemas
-- ============================================================

ALTER TABLE public.database_connection_schemas
  ADD COLUMN IF NOT EXISTS snapshot_kind text NOT NULL DEFAULT 'relational',
  ADD COLUMN IF NOT EXISTS entity_count integer NOT NULL DEFAULT 0;

-- Backfill generic count from existing relational table_count values.
UPDATE public.database_connection_schemas
SET entity_count = COALESCE(table_count, 0)
WHERE entity_count IS NULL OR entity_count = 0;

-- Keep values constrained to known snapshot families.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_database_connection_schemas_snapshot_kind'
      AND conrelid = 'public.database_connection_schemas'::regclass
  ) THEN
    ALTER TABLE public.database_connection_schemas
      ADD CONSTRAINT chk_database_connection_schemas_snapshot_kind
      CHECK (snapshot_kind IN ('relational', 'document'));
  END IF;
END
$$;

-- Generic non-negative count for entities (table/collection/etc.).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_database_connection_schemas_entity_count'
      AND conrelid = 'public.database_connection_schemas'::regclass
  ) THEN
    ALTER TABLE public.database_connection_schemas
      ADD CONSTRAINT chk_database_connection_schemas_entity_count
      CHECK (entity_count >= 0);
  END IF;
END
$$;

-- ============================================================
-- 2) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_snapshot_kind
  ON public.database_connection_schemas (snapshot_kind);

CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_entity_count
  ON public.database_connection_schemas (entity_count);

-- Useful for admin/listing queries by org and snapshot family.
CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_org_snapshot_kind
  ON public.database_connection_schemas (organization_id, snapshot_kind);

-- ============================================================
-- 3) LOOKUP SEED: MongoDB type + product rows
-- ============================================================

INSERT INTO public.database_types (name, is_active)
VALUES ('Non-Relational', TRUE)
ON CONFLICT (name) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.databases (identifier, name, database_type_id, is_active)
VALUES (
  'mongodb',
  'MongoDB',
  (SELECT id FROM public.database_types WHERE name = 'Non-Relational' LIMIT 1),
  TRUE
)
ON CONFLICT (identifier) DO UPDATE
SET
  name = EXCLUDED.name,
  database_type_id = EXCLUDED.database_type_id,
  is_active = EXCLUDED.is_active,
  updated_at = now();
