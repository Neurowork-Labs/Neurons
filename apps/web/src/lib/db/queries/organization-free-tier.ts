/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lowest-index active plan is treated as the free tier (matches ordered plan picker).
 */
export async function fetchFreeTierPlanId(
  supabase: SupabaseClient,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('plans')
    .select('id')
    .eq('is_active', true)
    .order('index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  const row = data as { id: string } | null;
  return { data: row?.id ?? null, error: null };
}

export type OwnedOrgSummary = { id: string; name: string };

/**
 * Organizations owned by the user on the free-tier plan that are currently Active.
 */
export async function fetchOwnedActiveFreeTierOrganizations(
  supabase: SupabaseClient,
  userId: string,
  freeTierPlanId: string,
): Promise<{ data: OwnedOrgSummary[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, organization_statuses(name)')
    .eq('owner_id', userId)
    .eq('plan_id', freeTierPlanId)
    .eq('is_deleted', false);

  if (error) {
    return { data: null, error: error.message };
  }

  type Row = {
    id: string;
    name: string;
    organization_statuses: { name: string } | { name: string }[] | null;
  };

  const active: OwnedOrgSummary[] = [];

  for (const row of (data ?? []) as Row[]) {
    const status = row.organization_statuses;
    const statusName = Array.isArray(status)
      ? status[0]?.name
      : status?.name;
    if ((statusName ?? '').toLowerCase() === 'active') {
      active.push({ id: row.id, name: row.name });
    }
  }

  return { data: active, error: null };
}

export async function setOrganizationsStatusId(
  supabase: SupabaseClient,
  organizationIds: string[],
  statusId: string,
): Promise<{ error: string | null }> {
  if (organizationIds.length === 0) {
    return { error: null };
  }

  const { error } = await supabase
    .from('organizations')
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .in('id', organizationIds);

  return { error: error?.message ?? null };
}
