-- =============================================================================
-- Migration: Add gemini-3-pro to models catalog
-- =============================================================================
-- Adds/updates Gemini 3 Pro in public.models so it is available for selection.
-- Re-runnable via ON CONFLICT upsert semantics.
-- =============================================================================

INSERT INTO public.models (
  name,
  display_name,
  model_tier_id,
  provider_name,
  provider_url,
  model_identifier,
  input_cost_per_1m_tokens,
  output_cost_per_1m_tokens,
  max_context_tokens,
  description
) VALUES (
  'gemini-3-pro',
  'Gemini 3 Pro',
  (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
  'google',
  'https://ai.google.dev',
  'gemini-3-pro',
  NULL,
  NULL,
  NULL,
  'High-quality Gemini 3 Pro model'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_tier_id = EXCLUDED.model_tier_id,
  provider_name = EXCLUDED.provider_name,
  provider_url = EXCLUDED.provider_url,
  model_identifier = EXCLUDED.model_identifier,
  input_cost_per_1m_tokens = EXCLUDED.input_cost_per_1m_tokens,
  output_cost_per_1m_tokens = EXCLUDED.output_cost_per_1m_tokens,
  max_context_tokens = EXCLUDED.max_context_tokens,
  description = EXCLUDED.description,
  is_active = TRUE;
