/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

export type OrganizationMemberOrgRow = {
  id: string;
  name: string;
  slug: string;
  planName: string | null;
  statusName: string | null;
};

type OrgEmbed = {
  id: string;
  name: string;
  slug: string;
  is_deleted: boolean;
  plan: { name: string | null } | { name: string | null }[] | null;
  organization_statuses: { name: string | null } | { name: string | null }[] | null;
};

type RawMemberRow = {
  organizations: OrgEmbed | OrgEmbed[] | null;
};

/**
 * Organizations the user belongs to (via organization_members), with plan name.
 * Soft-deleted orgs and memberships are excluded.
 */
export async function fetchOrganizationsForUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: OrganizationMemberOrgRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      organizations (
        id,
        name,
        slug,
        is_deleted,
        plan:plans (
          name
        ),
        organization_statuses (
          name
        )
      )
    `,
    )
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error) {
    return { data: null, error: error.message };
  }

  const rows: OrganizationMemberOrgRow[] = [];
  const seen = new Set<string>();

  for (const row of (data ?? []) as RawMemberRow[]) {
    const rawOrg = row.organizations;
    const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
    if (!org || org.is_deleted) continue;
    if (seen.has(org.id)) continue;
    seen.add(org.id);
    const st = org.organization_statuses;
    const statusName = Array.isArray(st) ? st[0]?.name ?? null : st?.name ?? null;
    const pl = org.plan;
    const planName = Array.isArray(pl) ? pl[0]?.name ?? null : pl?.name ?? null;
    rows.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      planName,
      statusName,
    });
  }

  return { data: rows, error: null };
}

export async function fetchProjectCountsByOrganizationIds(
  supabase: SupabaseClient,
  organizationIds: string[],
): Promise<{ data: Map<string, number> | null; error: string | null }> {
  if (organizationIds.length === 0) {
    return { data: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from('projects')
    .select('organization_id')
    .in('organization_id', organizationIds)
    .eq('is_deleted', false);

  if (error) {
    return { data: null, error: error.message };
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { organization_id: string }).organization_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return { data: counts, error: null };
}
