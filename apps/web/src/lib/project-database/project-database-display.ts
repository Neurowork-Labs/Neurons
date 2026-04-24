/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { cn } from '@/lib/utils';

/** Title-case first character; rest lowercased for consistent status labels (e.g. Ready, Pending). */
export function formatDatabaseSchemaStatusLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '—';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function databaseSchemaStatusPillClassName(statusRaw: string): string {
  const key = String(statusRaw ?? '').trim().toLowerCase();
  switch (key) {
    case 'ready':
    case 'connected':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
    case 'pending':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/45 dark:text-amber-200';
    case 'processing':
      return 'bg-sky-100 text-sky-900 dark:bg-sky-950/45 dark:text-sky-200';
    case 'failed':
      return 'bg-red-100 text-red-900 dark:bg-red-950/45 dark:text-red-200';
    case 'disconnected':
      return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200';
    default:
      return 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200';
  }
}

export function databaseSchemaStatusPillClassNameCn(statusRaw: string): string {
  return cn(
    'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
    databaseSchemaStatusPillClassName(statusRaw),
  );
}
