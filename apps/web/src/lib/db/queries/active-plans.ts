/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActivePlanOption } from '@/lib/plans/plan-types';

export async function fetchActivePlans(
  supabase: SupabaseClient,
): Promise<{ data: ActivePlanOption[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('plans')
    .select('id, name, index')
    .eq('is_active', true)
    .order('index', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = (data ?? []) as ActivePlanOption[];
  return { data: rows, error: null };
}
