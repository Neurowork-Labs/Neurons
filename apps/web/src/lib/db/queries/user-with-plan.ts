/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

export type UserWithPlanRow = {
  email: string;
  planName: string | null;
};

type SupabaseUserWithPlanSelect = {
  email: string | null;
  plan_id: string | null;
};

export async function fetchUserWithPlanById(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: UserWithPlanRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('users')
    .select('email, plan_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  const row = data as unknown as SupabaseUserWithPlanSelect;
  const email = String(row.email ?? '');
  const planId = row.plan_id;

  // Resolve plan name separately (more robust than relying on FK relationship
  // naming/joins in Supabase).
  if (!planId) {
    return { data: { email, planName: null }, error: null };
  }

  const { data: planRow, error: planError } = await supabase
    .from('plans')
    .select('name')
    .eq('id', planId)
    .maybeSingle();

  if (planError) {
    return { data: { email, planName: null }, error: null };
  }

  return {
    data: {
      email,
      planName: (planRow?.name ?? null) as string | null,
    },
    error: null,
  };
}
