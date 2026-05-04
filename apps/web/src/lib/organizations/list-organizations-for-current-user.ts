/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import {
  fetchOrganizationsForUserId,
  fetchProjectCountsByOrganizationIds,
} from '@/lib/db/queries/organizations-for-user';
import type { OrganizationListItem } from '@/lib/organizations/organization-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type ListOrganizationsResult =
  | { ok: true; organizations: OrganizationListItem[] }
  | { ok: false; message: string };

export async function listOrganizationsForCurrentUser(): Promise<ListOrganizationsResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const userId = authData.user.id;

  const { data: orgs, error: orgError } = await fetchOrganizationsForUserId(
    supabase,
    userId,
  );

  if (orgError) {
    return { ok: false, message: orgError };
  }

  const list = orgs ?? [];
  const ids = list.map((o) => o.id);

  const { data: countMap, error: countError } =
    await fetchProjectCountsByOrganizationIds(supabase, ids);

  if (countError) {
    return { ok: false, message: countError };
  }

  const organizations: OrganizationListItem[] = list.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    planName: o.planName ?? 'Free',
    statusName: o.statusName ?? '—',
    projectCount: countMap?.get(o.id) ?? 0,
  }));

  return { ok: true, organizations };
}
