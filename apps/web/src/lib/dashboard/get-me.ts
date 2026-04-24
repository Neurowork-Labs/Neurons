/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { fetchUserWithPlanById } from '@/lib/db/queries/user-with-plan';

export type GetMeResult =
  | { ok: true; email: string; planName: string | null }
  | { ok: false; message: string };

export async function getMe(): Promise<GetMeResult> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const { data: profile, error: profileError } = await fetchUserWithPlanById(
    supabase,
    data.user.id,
  );

  if (profileError) {
    // Fallback: still return auth email even if the profile/plan lookup fails.
    return {
      ok: true,
      email: String(data.user.email ?? ''),
      planName: null,
    };
  }

  if (!profile) {
    // Fallback: sometimes `public.users` may not exist for new accounts yet.
    // Still show the signed-in email in the UI.
    return {
      ok: true,
      email: String(data.user.email ?? ''),
      planName: null,
    };
  }

  return { ok: true, email: profile.email, planName: profile.planName };
}

