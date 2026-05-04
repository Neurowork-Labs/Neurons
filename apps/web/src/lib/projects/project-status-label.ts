/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export function formatProjectStatusLabel(status: string) {
  if (!status || status === '—') return status;
  const s = status.trim();
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function projectStatusTagClassName(statusRaw: string): string {
  const key = statusRaw.trim().toLowerCase();
  const base =
    'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold tracking-tight';

  switch (key) {
    case 'active':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/55 dark:text-emerald-100`;
    case 'draft':
      return `${base} border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100`;
    case 'archived':
      return `${base} border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/90 dark:text-neutral-300`;
    case 'paused':
      return `${base} border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-100`;
    default:
      if (!key || key === '—') {
        return `${base} border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800/90 dark:text-neutral-300`;
      }
      return `${base} border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-100`;
  }
}
