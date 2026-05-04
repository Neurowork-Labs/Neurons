/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/**
 * Sign-up aligns with `public.users` in docs/db-schema/sql-queries.md:
 * no `username` column — identity uses email; display uses first_name / last_name via
 * auth metadata (`handle_new_user`) and optional UPDATE when a session exists.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { updatePublicUserNamesAfterSignUp } from '@/lib/auth/sync-signup-user-profile';

export type ManualSignUpPayload = {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
};

export type ManualAuthResult = {
  ok: boolean;
  message: string;
  redirectToDashboard: boolean;
};

export async function manualSignUp(
  payload: ManualSignUpPayload,
): Promise<ManualAuthResult> {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const confirmPassword = payload.confirmPassword;
  const firstName = payload.firstName.trim();
  const lastName = payload.lastName.trim();

  if (!firstName || !lastName) {
    return {
      ok: false,
      message: 'First name and last name are required.',
      redirectToDashboard: false,
    };
  }

  if (!email || !password || !confirmPassword) {
    return {
      ok: false,
      message: 'Email, password, and confirm password are required.',
      redirectToDashboard: false,
    };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      message: 'Password and confirm password do not match.',
      redirectToDashboard: false,
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
      redirectToDashboard: false,
    };
  }

  if (!data.session) {
    return {
      ok: true,
      message: 'Account created. Please verify your email to continue.',
      redirectToDashboard: false,
    };
  }

  if (data.user?.id) {
    const sync = await updatePublicUserNamesAfterSignUp(
      supabase,
      data.user.id,
      firstName,
      lastName,
    );
    if (!sync.ok) {
      return {
        ok: false,
        message: sync.message,
        redirectToDashboard: false,
      };
    }
  }

  return {
    ok: true,
    message: 'Account created successfully.',
    redirectToDashboard: true,
  };
}
