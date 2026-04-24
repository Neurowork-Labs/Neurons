-- Add WordPress relational lookups (database_types + databases)
-- Date: 2026-04-07
-- Idempotent migration for Supabase SQL Editor.
--
-- Adds:
-- - database_types.name = 'WordPress Relational'
-- - databases.identifier in ('wp-mysql', 'wp-mariadb') under that type

INSERT INTO public.database_types (name, is_active)
VALUES ('WordPress Relational', TRUE)
ON CONFLICT (name) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.databases (identifier, name, database_type_id, is_active)
VALUES
  (
    'wp-mysql',
    'MySQL',
    (SELECT id FROM public.database_types WHERE name = 'WordPress Relational' LIMIT 1),
    TRUE
  ),
  (
    'wp-mariadb',
    'MariaDB',
    (SELECT id FROM public.database_types WHERE name = 'WordPress Relational' LIMIT 1),
    TRUE
  )
ON CONFLICT (identifier) DO UPDATE
SET
  name = EXCLUDED.name,
  database_type_id = EXCLUDED.database_type_id,
  is_active = EXCLUDED.is_active,
  updated_at = now();

