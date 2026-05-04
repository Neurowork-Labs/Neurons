/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { CircleHelp } from 'lucide-react';

/**
 * Placeholder: opens nothing until the Help experience is built (see docs/task-queue/pending.md).
 */
export function TopbarHelpButton() {
  return (
    <button
      type="button"
      onClick={() => {}}
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      aria-label="Help"
      title="Help (coming soon)"
    >
      <CircleHelp className="h-5 w-5" aria-hidden />
    </button>
  );
}
