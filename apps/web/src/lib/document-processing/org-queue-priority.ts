/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** `public.plans.queue_priority` — higher values are processed first by the worker. */
export async function getOrgPlanQueuePriority(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('plan_id')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgError || !orgRow?.plan_id) return 0;

  const { data: planRow, error: planError } = await supabase
    .from('plans')
    .select('queue_priority')
    .eq('id', orgRow.plan_id)
    .maybeSingle();

  if (planError || planRow == null) return 0;

  const raw = (planRow as { queue_priority?: unknown }).queue_priority;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}
