-- =============================================================================
-- Migration: embedding_usage_events uses worker_model_id FK (replaces model_identifier)
-- Requires public.worker_models to exist and be populated.
-- =============================================================================

-- 1) Add FK column (nullable until backfill completes)
ALTER TABLE public.embedding_usage_events
  ADD COLUMN IF NOT EXISTS worker_model_id uuid;

ALTER TABLE public.embedding_usage_events
  ADD CONSTRAINT IF NOT EXISTS fk_embedding_usage_worker_model
  FOREIGN KEY (worker_model_id) REFERENCES public.worker_models(id);

-- 2) Backfill from existing model_identifier values
UPDATE public.embedding_usage_events e
SET worker_model_id = wm.id
FROM public.worker_models wm
WHERE e.worker_model_id IS NULL
  AND wm.model_identifier = e.model_identifier;

-- 3) Safety check: abort if any rows could not be mapped
DO $$
DECLARE
  missing bigint;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM public.embedding_usage_events
  WHERE worker_model_id IS NULL;

  IF missing > 0 THEN
    RAISE EXCEPTION 'embedding_usage_events backfill failed: % rows missing worker_model_id. Ensure worker_models.model_identifier matches previous embedding_usage_events.model_identifier.', missing;
  END IF;
END$$;

-- 4) Make worker_model_id required and drop old column
ALTER TABLE public.embedding_usage_events
  ALTER COLUMN worker_model_id SET NOT NULL;

ALTER TABLE public.embedding_usage_events
  DROP COLUMN IF EXISTS model_identifier;

-- 5) Index for fast joins/filters
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_worker_model
  ON public.embedding_usage_events (worker_model_id);

