/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/**
 * Email + password sign-in only. `public.users` has no `username`; login identity is email
 * (see docs/db-schema/sql-queries.md).
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';

export type ManualSignInPayload = {
  email: string;
  password: string;
};

export type ManualAuthResult = {
  ok: boolean;
  message: string;
};

export async function manualSignIn(
  payload: ManualSignInPayload,
): Promise<ManualAuthResult> {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  if (!email || !password) {
    return {
      ok: false,
      message: 'Email and password are required.',
    };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const normalizedMessage =
      error.message.toLowerCase().includes('invalid login credentials')
        ? 'Invalid Credentials'
        : error.message;

    return {
      ok: false,
      message: normalizedMessage,
    };
  }

  return {
    ok: true,
    message: 'Signed in successfully.',
  };
}