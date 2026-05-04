/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { safeGetUser } from '@/lib/auth/safe-get-user';

export default async function ProtectedRoutesLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const auth = await safeGetUser();

  if (!auth.user) {
    redirect(
      auth.sessionExpired
        ? '/auth?reason=session_expired'
        : '/auth',
    );
  }

  return children;
}
