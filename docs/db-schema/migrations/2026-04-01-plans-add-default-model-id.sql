/*
  Add default_model_id to public.plans — FK to public.models(id).
  Used when a connected agent uses "Use default model" (project_agents.model_id IS NULL):
  resolve the org’s plan and use plans.default_model_id when set.

  Run in Supabase SQL editor after public.models exists.
*/

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS default_model_id uuid
    REFERENCES public.models (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.plans.default_model_id IS
  'Default LLM model for this plan when project_agents.model_id is null. Must be a model tier allowed by max_model_tier_index.';

CREATE INDEX IF NOT EXISTS idx_plans_default_model_id
  ON public.plans (default_model_id)
  WHERE default_model_id IS NOT NULL;
