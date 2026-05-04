/*
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/auth/session-expired';

/**
 * Mounted once in the root layout. Listens for the custom
 * `neurons:session-expired` event dispatched by `apiFetch`.
 *
 * Behaviour:
 *  1. Shows a persistent (infinite-duration) error toast.
 *  2. Waits for the user to click or press a key anywhere on the page.
 *  3. Redirects to `/auth` so the user can sign in again.
 */
export function SessionExpiredHandler() {
  const firedRef = useRef(false);

  useEffect(() => {
    function handleSessionExpired() {
      if (firedRef.current) return;
      firedRef.current = true;

      toast.error(SESSION_EXPIRED_MESSAGE, {
        duration: Infinity,
        dismissible: false,
      });

      function redirectToAuth() {
        document.removeEventListener('click', redirectToAuth, true);
        document.removeEventListener('keydown', redirectToAuth, true);
        const next = window.location.pathname + window.location.search;
        window.location.href = `/auth?reason=session_expired&next=${encodeURIComponent(next)}`;
      }

      setTimeout(() => {
        document.addEventListener('click', redirectToAuth, { capture: true });
        document.addEventListener('keydown', redirectToAuth, { capture: true });
      }, 200);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  return null;
}
