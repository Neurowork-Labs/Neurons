/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { getSupabaseServerClient } from '@/lib/supabase/server';

export type SignOutResult = {
  ok: boolean;
  message: string;
};

export async function signOut(): Promise<SignOutResult> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    message: 'Signed out successfully.',
  };
}