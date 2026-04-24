/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { consumeAuthSuccessToast } from '@/lib/auth/auth-toast';

/**
 * Shows a success toast after auth redirect when the message was queued in sessionStorage
 * (see `queueAuthSuccessToast` in `lib/auth/auth-toast.ts`).
 */
export function AuthSuccessToaster() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith('/dashboard')) return;

    const message = consumeAuthSuccessToast();
    if (message) {
      toast.success(message);
    }
  }, [pathname]);

  return null;
}
