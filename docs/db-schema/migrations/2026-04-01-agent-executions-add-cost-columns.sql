-- Add token-cost tracking columns on agent executions.
-- Values are calculated from `public.models` token pricing at write time.

ALTER TABLE public.agent_executions
  ADD COLUMN IF NOT EXISTS input_token_cost_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS output_token_cost_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(12,6);
