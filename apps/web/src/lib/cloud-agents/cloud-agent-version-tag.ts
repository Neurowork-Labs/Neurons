/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/**
 * Pill styles aligned with `projectStatusTagClassName` default (violet) on org project cards.
 */
export function cloudAgentVersionTagClassName(): string {
  return 'inline-flex shrink-0 items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold tracking-tight text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-100';
}

/** Display version with a single `v` prefix (avoids `vv` if already present). */
export function formatAgentVersionForCard(version: string): string {
  const t = version.trim();
  if (!t) return 'v—';
  if (/^v\d/i.test(t)) return t;
  return `v${t}`;
}
