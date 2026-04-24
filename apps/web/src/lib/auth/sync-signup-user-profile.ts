/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

export type SyncSignupProfileResult = {
  ok: boolean;
  message: string;
};

/**
 * After signup, when the user has an active session, persist first/last name on `public.users`.
 * RLS allows users to update their own row. This complements `handle_new_user()`, which reads
 * the same fields from `auth.users.raw_user_meta_data` at insert time.
 * `public.users` has no `username` column (dropped); only first_name / last_name / email, etc.
 */
export async function updatePublicUserNamesAfterSignUp(
  supabase: SupabaseClient,
  userId: string,
  firstName: string,
  lastName: string,
): Promise<SyncSignupProfileResult> {
  const first_name = firstName.trim();
  const last_name = lastName.trim();

  const { error } = await supabase
    .from('users')
    .update({
      first_name,
      last_name,
    })
    .eq('id', userId);

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    message: 'Profile updated.',
  };
}
