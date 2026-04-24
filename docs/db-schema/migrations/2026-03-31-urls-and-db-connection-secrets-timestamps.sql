-- URLs lookup table + database_connection_secrets timestamps
-- Date: 2026-03-31
-- Prerequisites: public.set_updated_at()

-- ============================================================
-- 1) TABLE: public.urls
-- ============================================================

CREATE TABLE IF NOT EXISTS public.urls (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_key     text        NOT NULL,
  url_value   text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  is_deleted  boolean     NOT NULL DEFAULT FALSE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_urls_url_key UNIQUE (url_key)
);

CREATE INDEX IF NOT EXISTS idx_urls_active_not_deleted
  ON public.urls (url_key)
  WHERE is_active = TRUE AND is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_set_updated_at_urls ON public.urls;
CREATE TRIGGER trg_set_updated_at_urls
  BEFORE UPDATE ON public.urls
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.urls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read urls"
  ON public.urls;
CREATE POLICY "Authenticated users can read urls"
  ON public.urls FOR SELECT
  TO authenticated
  USING (TRUE);

-- Optional seed for widget script source URL.
-- Update this value per environment (dev/stage/prod).
INSERT INTO public.urls (url_key, url_value, is_active, is_deleted)
VALUES ('rag_agent_widget_script_src', 'http://10.85.142.106:3000/scripts/rag-agent-widget.js', TRUE, FALSE)
ON CONFLICT (url_key) DO UPDATE
SET
  url_value = EXCLUDED.url_value,
  is_active = EXCLUDED.is_active,
  is_deleted = EXCLUDED.is_deleted,
  updated_at = now();

-- ============================================================
-- 2) ALTER: public.database_connection_secrets
-- ============================================================

ALTER TABLE public.database_connection_secrets
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_set_updated_at_database_connection_secrets
  ON public.database_connection_secrets;
CREATE TRIGGER trg_set_updated_at_database_connection_secrets
  BEFORE UPDATE ON public.database_connection_secrets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

