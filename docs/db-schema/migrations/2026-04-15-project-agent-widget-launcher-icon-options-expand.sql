-- Expand allowed Lucide launcher icons for RAG widget trigger.
-- Safe to run in Supabase SQL editor for existing environments.

DO $$
DECLARE
  existing_constraint_name text;
BEGIN
  IF to_regclass('public.project_agent_widget_configs') IS NULL THEN
    RAISE NOTICE 'project_agent_widget_configs table does not exist. Skipping.';
    RETURN;
  END IF;

  SELECT c.conname
  INTO existing_constraint_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.project_agent_widget_configs'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%lucide_icon%'
  LIMIT 1;

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.project_agent_widget_configs DROP CONSTRAINT IF EXISTS %I',
      existing_constraint_name
    );
  END IF;

  ALTER TABLE public.project_agent_widget_configs
    ADD CONSTRAINT project_agent_widget_configs_lucide_icon_check
    CHECK (
      lucide_icon IN (
        'user-round',
        'message-circle',
        'bot',
        'sparkles',
        'circle-help',
        'message-square',
        'send',
        'headset',
        'life-buoy',
        'badge-help',
        'info',
        'mail',
        'phone',
        'megaphone',
        'bell',
        'rocket',
        'shield-check',
        'user',
        'at-sign',
        'book-open'
      )
    );
END $$;
