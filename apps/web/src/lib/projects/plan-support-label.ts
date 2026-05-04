/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/**
 * Display label for `public.support_types.name` joined via `public.plans.support_type_id`
 * (organization plan), per docs/db-schema/sql-queries.md.
 */
export function formatPlanSupportTypeLabel(
  name: string | null | undefined,
): string {
  const t = String(name ?? '').trim();
  if (!t) {
    return '—';
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}
