-- =============================================================================
-- Migration: worker_models catalog
-- Worker-only LLM catalog (embedding/rerank/OCR workers), separate from public.models.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.worker_models (
  id                         uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                       text          NOT NULL,
  display_name               text          NOT NULL,
  provider_name              text          NOT NULL,
  provider_url               text,
  model_identifier           text          NOT NULL,
  input_cost_per_1m_tokens   numeric(10,4),
  output_cost_per_1m_tokens  numeric(10,4),
  max_context_tokens         integer,
  description                text,
  is_active                  boolean       NOT NULL DEFAULT TRUE,
  created_at                 timestamptz   NOT NULL DEFAULT now(),
  updated_at                 timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_worker_models_name UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_models_name
  ON public.worker_models (name);
CREATE INDEX IF NOT EXISTS idx_worker_models_provider
  ON public.worker_models (provider_name) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.worker_models;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.worker_models
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.worker_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active worker models" ON public.worker_models;
DROP POLICY IF EXISTS "Service role can manage worker models" ON public.worker_models;

CREATE POLICY "Authenticated users can read active worker models"
  ON public.worker_models FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Service role can manage worker models"
  ON public.worker_models FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

