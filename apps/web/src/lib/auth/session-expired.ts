/*
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED' as const;
export const SESSION_EXPIRED_MESSAGE = 'Session expired. Please login again.';
export const SESSION_EXPIRED_EVENT = 'neurons:session-expired';

export function isRefreshTokenError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === 'refresh_token_not_found') return true;
  if (
    typeof error.message === 'string' &&
    error.message.includes('Refresh Token Not Found')
  )
    return true;
  return false;
}
