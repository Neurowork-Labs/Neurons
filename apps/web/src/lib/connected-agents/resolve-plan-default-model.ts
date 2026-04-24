/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Given an organization id, look up its plan and return `plans.default_model_id`.
 * Returns `null` when the plan has no default or the org/plan row is missing.
 */
export async function resolvePlanDefaultModelId(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('plan_id')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgError || !orgRow?.plan_id) return null;

  const { data: planRow, error: planError } = await supabase
    .from('plans')
    .select('default_model_id')
    .eq('id', orgRow.plan_id)
    .maybeSingle();

  if (planError) return null;

  const defaultModelId = String(planRow?.default_model_id ?? '').trim();
  return defaultModelId || null;
}
