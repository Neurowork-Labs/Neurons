/*
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { SESSION_EXPIRED_CODE, SESSION_EXPIRED_EVENT } from './session-expired';

function dispatchSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

/**
 * Drop-in replacement for `fetch` + `res.json()` that automatically detects
 * session-expired responses and fires a global event so the
 * `SessionExpiredHandler` can show the persistent toast + redirect.
 *
 * Existing api-client files can migrate to this one at a time.
 */
export async function apiFetch<
  T extends { ok: boolean; code?: string; message?: string },
>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = (await res.json()) as T;

  const isExpired =
    res.status === 401 ||
    data.code === SESSION_EXPIRED_CODE ||
    (typeof data.message === 'string' &&
      data.message.includes('Refresh Token Not Found'));

  if (isExpired) {
    dispatchSessionExpired();
  }

  return data;
}
