/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { fetchActivePlans } from '@/lib/db/queries/active-plans';
import type { ActivePlansApiResult } from '@/lib/plans/plan-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function listActivePlans(): Promise<ActivePlansApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const { data, error } = await fetchActivePlans(supabase);
  if (error) {
    return { ok: false, message: error };
  }

  return { ok: true, plans: data ?? [] };
}
