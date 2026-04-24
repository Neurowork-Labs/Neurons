/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type ModelPricingInfo = {
  id: string;
  inputCostPer1mTokens: number | null;
  outputCostPer1mTokens: number | null;
};

const modelPricingCache = new Map<string, ModelPricingInfo>();

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function resolveModelPricingInfo(
  supabase: SupabaseClient,
  modelIdentifier: string | null,
): Promise<ModelPricingInfo | null> {
  if (!modelIdentifier) return null;

  const cached = modelPricingCache.get(modelIdentifier);
  if (cached) return cached;

  const { data } = await supabase
    .from('models')
    .select('id, input_cost_per_1m_tokens, output_cost_per_1m_tokens')
    .eq('model_identifier', modelIdentifier)
    .eq('is_active', true)
    .maybeSingle();

  if (data?.id) {
    const resolved: ModelPricingInfo = {
      id: String(data.id),
      inputCostPer1mTokens: toFiniteNumber(data.input_cost_per_1m_tokens),
      outputCostPer1mTokens: toFiniteNumber(data.output_cost_per_1m_tokens),
    };
    modelPricingCache.set(modelIdentifier, resolved);
    return resolved;
  }

  const { data: byName } = await supabase
    .from('models')
    .select('id, input_cost_per_1m_tokens, output_cost_per_1m_tokens')
    .eq('name', modelIdentifier)
    .eq('is_active', true)
    .maybeSingle();

  if (byName?.id) {
    const resolved: ModelPricingInfo = {
      id: String(byName.id),
      inputCostPer1mTokens: toFiniteNumber(byName.input_cost_per_1m_tokens),
      outputCostPer1mTokens: toFiniteNumber(byName.output_cost_per_1m_tokens),
    };
    modelPricingCache.set(modelIdentifier, resolved);
    return resolved;
  }

  return null;
}

export type RecordAgentExecutionInput = {
  projectAgentId: string;
  organizationId: string;
  conversationId: string | null;
  modelName: string | null;
  status: 'success' | 'error';
  errorCode?: string | null;
  latencyMs?: number | null;
  tokensInput?: number;
  tokensOutput?: number;
  metadata?: Record<string, unknown> | null;
};

/**
 * Inserts one row into `agent_executions`. Best-effort — failures are logged
 * but never block the chat response.
 */
export async function recordAgentExecution(
  supabase: SupabaseClient,
  input: RecordAgentExecutionInput,
): Promise<void> {
  try {
    const modelPricingInfo = await resolveModelPricingInfo(supabase, input.modelName);
    const modelId = modelPricingInfo?.id ?? null;
    const tokensInput = Math.max(0, Number(input.tokensInput ?? 0));
    const tokensOutput = Math.max(0, Number(input.tokensOutput ?? 0));
    const inputTokenCostUsd =
      modelPricingInfo?.inputCostPer1mTokens != null
        ? (tokensInput / 1_000_000) * modelPricingInfo.inputCostPer1mTokens
        : null;
    const outputTokenCostUsd =
      modelPricingInfo?.outputCostPer1mTokens != null
        ? (tokensOutput / 1_000_000) * modelPricingInfo.outputCostPer1mTokens
        : null;
    const totalCostUsd =
      inputTokenCostUsd != null || outputTokenCostUsd != null
        ? (inputTokenCostUsd ?? 0) + (outputTokenCostUsd ?? 0)
        : null;

    const row: Record<string, unknown> = {
      project_agent_id: input.projectAgentId,
      organization_id: input.organizationId,
      conversation_id: input.conversationId || null,
      model_id: modelId,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      input_token_cost_usd: inputTokenCostUsd,
      output_token_cost_usd: outputTokenCostUsd,
      total_cost_usd: totalCostUsd,
      latency_ms: input.latencyMs ?? null,
      status: input.status,
      error_code: input.errorCode ?? null,
      metadata: input.metadata ?? null,
    };

    await supabase.from('agent_executions').insert(row);
  } catch {
    // Best-effort: never break the chat flow for execution tracking
  }
}
