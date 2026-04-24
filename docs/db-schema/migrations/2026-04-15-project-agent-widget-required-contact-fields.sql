-- Add per-agent required contact fields for public widget contact gate.
-- Safe for existing environments where project_agent_widget_configs already exists.
--
-- Postgres CHECK constraints cannot contain subqueries, so we use an
-- IMMUTABLE validator function that the CHECK can call.

CREATE OR REPLACE FUNCTION public.is_valid_contact_fields(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(val) = 'array'
    AND bool_and(elem IN ('name', 'email', 'phone', 'location'))
  FROM jsonb_array_elements_text(val) AS t(elem)
  UNION ALL
  SELECT jsonb_typeof(val) = 'array' AND jsonb_array_length(val) = 0
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(val))
  LIMIT 1;
$$;

DO $$
BEGIN
  IF to_regclass('public.project_agent_widget_configs') IS NULL THEN
    RAISE NOTICE 'project_agent_widget_configs table does not exist. Skipping.';
    RETURN;
  END IF;

  ALTER TABLE public.project_agent_widget_configs
    ADD COLUMN IF NOT EXISTS required_contact_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

  ALTER TABLE public.project_agent_widget_configs
    DROP CONSTRAINT IF EXISTS project_agent_widget_configs_required_contact_fields_valid;

  ALTER TABLE public.project_agent_widget_configs
    ADD CONSTRAINT project_agent_widget_configs_required_contact_fields_valid
    CHECK (public.is_valid_contact_fields(required_contact_fields));
END $$;
