-- =============================================================================
-- Migration: Add gemini-2.0-flash to models catalog
-- =============================================================================
-- The RAG agent uses gemini-2.0-flash as its primary chat model. Without this
-- row, agent_executions cannot reference a valid model_id.
-- =============================================================================

INSERT INTO public.models (
  name, display_name, model_tier_id,
  provider_name, provider_url, model_identifier,
  input_cost_per_1m_tokens, output_cost_per_1m_tokens,
  max_context_tokens, description
) VALUES (
  'gemini-2.0-flash',
  'Gemini 2.0 Flash',
  (SELECT id FROM public.model_tiers WHERE name = 'basic'),
  'google',
  'https://ai.google.dev',
  'gemini-2.0-flash',
  NULL, NULL, NULL,
  'Fast low-latency model (2.0 generation)'
)
ON CONFLICT (name) DO NOTHING;
