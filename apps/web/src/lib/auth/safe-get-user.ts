/*
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { User } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@/lib/supabase/server';

import {
  SESSION_EXPIRED_CODE,
  SESSION_EXPIRED_MESSAGE,
  isRefreshTokenError,
} from './session-expired';

export type SafeGetUserResult =
  | { user: User; sessionExpired: false; code: null; message: null }
  | { user: null; sessionExpired: true; code: typeof SESSION_EXPIRED_CODE; message: string }
  | { user: null; sessionExpired: false; code: 'AUTH_ERROR'; message: string };

export async function safeGetUser(): Promise<SafeGetUserResult> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isRefreshTokenError(error)) {
      return {
        user: null,
        sessionExpired: true,
        code: SESSION_EXPIRED_CODE,
        message: SESSION_EXPIRED_MESSAGE,
      };
    }
    return {
      user: null,
      sessionExpired: false,
      code: 'AUTH_ERROR',
      message: error.message,
    };
  }

  if (!data.user) {
    return {
      user: null,
      sessionExpired: false,
      code: 'AUTH_ERROR',
      message: 'Unauthorized',
    };
  }

  return { user: data.user, sessionExpired: false, code: null, message: null };
}
