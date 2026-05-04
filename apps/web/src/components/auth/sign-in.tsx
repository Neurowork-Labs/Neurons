/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { NeuronsLogo } from '@/components/brand/neurons-logo';
import { signInViaApi } from '@/lib/auth/auth-api-client';
import { queueAuthSuccessToast } from '@/lib/auth/auth-toast';
import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/session-expired';

type SignInProps = {
  message?: string;
  reason?: string;
  next?: string;
};

export function SignIn({ message, reason, next }: SignInProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sessionExpiredShown = useRef(false);

  useEffect(() => {
    if (reason === 'session_expired' && !sessionExpiredShown.current) {
      sessionExpiredShown.current = true;
      toast.error(SESSION_EXPIRED_MESSAGE, { duration: 5000 });
    }
  }, [reason]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const email = String(formData.get('email') ?? '');
      const password = String(formData.get('password') ?? '');

      const result = await signInViaApi({ email, password });

      if (!result.ok) {
        toast.error(result.message || 'Invalid Credentials');
        return;
      }

      queueAuthSuccessToast(result.message || 'Signed in successfully');
      const dest = typeof next === 'string' && next.startsWith('/') ? next : '/dashboard';
      router.push(dest);
      router.refresh();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-dotted-background flex min-h-screen items-center justify-center px-4 py-10 font-dm-sans text-neutral-900">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-neutral-200 bg-[#f3f3f3] px-6 py-10 sm:px-10 sm:py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="flex justify-center">
            <NeuronsLogo />
          </div>

          <h1 className="mt-8 text-center text-3xl tracking-tight sm:text-4xl">
            Sign in to Neurons
          </h1>

          {message ? (
            <p className="mt-6 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-700">
              {message}
            </p>
          ) : null}

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-base font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="Your email address"
                className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base outline-none transition focus:border-neutral-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-base font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base outline-none transition focus:border-neutral-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full cursor-pointer rounded-lg bg-neutral-900 text-base font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Continuing…' : 'Continue'}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-neutral-300" />
            <span className="text-lg font-medium tracking-wide text-neutral-500">OR</span>
            <span className="h-px flex-1 bg-neutral-300" />
          </div>

          <p className="text-center text-xl text-neutral-600">
            Don&apos;t have an account?{' '}
            <a href="/auth/signup" className="font-medium text-orange-500">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}