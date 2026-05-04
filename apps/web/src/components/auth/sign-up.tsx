/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { NeuronsLogo } from '@/components/brand/neurons-logo';
import { signUpViaApi } from '@/lib/auth/auth-api-client';
import { queueAuthSuccessToast } from '@/lib/auth/auth-toast';

type SignUpProps = {
  message?: string;
};

export function SignUp({ message }: SignUpProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const firstName = String(formData.get('firstName') ?? '');
      const lastName = String(formData.get('lastName') ?? '');
      const email = String(formData.get('email') ?? '');
      const password = String(formData.get('password') ?? '');
      const confirmPassword = String(formData.get('confirmPassword') ?? '');

      const result = await signUpViaApi({
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
      });

      if (!result.ok) {
        toast.error(result.message || 'Unable to sign up');
        return;
      }

      if (result.redirectToDashboard) {
        queueAuthSuccessToast(result.message || 'Signed up successfully');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.success(result.message || 'Signed up successfully');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-dotted-background flex min-h-screen items-center justify-center px-4 py-10 font-dm-sans text-neutral-900">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-neutral-200 bg-[#f3f3f3] px-6 py-10 sm:px-10 sm:py-12">
        <section className="mx-auto w-full max-w-md">
          <div className="flex justify-center">
            <NeuronsLogo />
          </div>

          <h1 className="mt-8 text-center text-3xl tracking-tight sm:text-4xl">
            Sign up to Neurons
          </h1>

          {message ? (
            <p className="mt-6 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-700">
              {message}
            </p>
          ) : null}

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-base font-medium">
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  placeholder="Enter your first name"
                  className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base outline-none transition focus:border-neutral-500"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-base font-medium">
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  placeholder="Enter your last name"
                  className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base outline-none transition focus:border-neutral-500"
                />
              </div>
            </div>

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
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="h-12 w-full rounded-lg border border-neutral-300 bg-white py-0 pl-4 pr-12 text-base outline-none transition focus:border-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="cursor-pointer absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-neutral-500 transition hover:text-neutral-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-base font-medium">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  className="h-12 w-full rounded-lg border border-neutral-300 bg-white py-0 pl-4 pr-12 text-base outline-none transition focus:border-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="cursor-pointer absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-neutral-500 transition hover:text-neutral-800"
                  aria-label={
                    showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
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
            Already have an account?{' '}
            <a href="/auth" className="font-medium text-orange-500">
              Sign in
            </a>
          </p>

          <p className="mt-10 text-center text-sm text-neutral-600">
            By creating an account, you agree to the Terms of Service
          </p>
        </section>
      </div>
    </main>
  );
}
