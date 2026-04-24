/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { cn } from '@/lib/utils';

/**
 * Shared emerald primary actions (e.g. “New organization”, “New project”, modal submits).
 * Reuse for create / confirm-primary buttons and other surfaces (e.g. highlighted chat bubbles).
 */
export const primaryCtaSurfaceClassName =
  'rounded-lg bg-emerald-800 font-semibold text-white shadow-sm transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-700 dark:hover:bg-emerald-800 dark:focus-visible:outline-emerald-600';

export const primaryCtaToolbarButtonClassName = cn(
  'inline-flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-2 px-4 text-sm sm:ml-auto sm:w-auto',
  primaryCtaSurfaceClassName,
);

export const primaryCtaDialogButtonClassName = cn(
  'h-10 cursor-pointer px-4 text-sm',
  primaryCtaSurfaceClassName,
);
