/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

type OrganizationStatusRow = {
  id: string;
  name: string;
};

export async function fetchDefaultOrganizationStatusId(
  supabase: SupabaseClient,
): Promise<{ data: string | null; error: string | null }> {
  const { data: activeStatus, error: activeError } = await supabase
    .from('organization_statuses')
    .select('id, name')
    .eq('is_active', true)
    .ilike('name', 'active')
    .maybeSingle();

  if (activeError) {
    return { data: null, error: activeError.message };
  }

  if (activeStatus?.id) {
    return { data: activeStatus.id, error: null };
  }

  const { data: anyActive, error: fallbackError } = await supabase
    .from('organization_statuses')
    .select('id, name')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    return { data: null, error: fallbackError.message };
  }

  const row = anyActive as OrganizationStatusRow | null;
  return { data: row?.id ?? null, error: null };
}

export async function fetchPausedOrganizationStatusId(
  supabase: SupabaseClient,
): Promise<{ data: string | null; error: string | null }> {
  const { data: pausedStatus, error: pausedError } = await supabase
    .from('organization_statuses')
    .select('id, name')
    .eq('is_active', true)
    .ilike('name', 'paused')
    .maybeSingle();

  if (pausedError) {
    return { data: null, error: pausedError.message };
  }

  if (pausedStatus?.id) {
    return { data: pausedStatus.id, error: null };
  }

  return { data: null, error: 'No paused organization status found.' };
}

export async function checkOrganizationSlugExists(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ exists: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: Boolean(data && data.length > 0), error: null };
}

