/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/**
 * Success toasts are lost on full-page navigation (`window.location`).
 * Queue a message here before `router.push` to the dashboard; `AuthSuccessToaster` consumes it.
 */

export const AUTH_SUCCESS_TOAST_STORAGE_KEY = 'agent_engine_auth_success_toast';

type QueuedAuthToast = {
  message: string;
};

export function queueAuthSuccessToast(message: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      AUTH_SUCCESS_TOAST_STORAGE_KEY,
      JSON.stringify({ message } satisfies QueuedAuthToast),
    );
  } catch {
    // storage full or disabled
  }
}

/** Returns the queued message once, then clears storage. */
export function consumeAuthSuccessToast(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_SUCCESS_TOAST_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_SUCCESS_TOAST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueuedAuthToast;
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
}
