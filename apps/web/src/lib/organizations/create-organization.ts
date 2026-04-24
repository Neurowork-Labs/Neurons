/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { randomUUID } from 'crypto';

import type {
  CreateOrganizationPayload,
  CreateOrganizationApiResult,
  OrganizationListItem,
} from '@/lib/organizations/organization-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  fetchOwnedActiveFreeTierOrganizations,
  fetchFreeTierPlanId,
  setOrganizationsStatusId,
} from '@/lib/db/queries/organization-free-tier';
import {
  checkOrganizationSlugExists,
  fetchDefaultOrganizationStatusId,
  fetchPausedOrganizationStatusId,
} from '@/lib/db/queries/organization-mutations';
import { slugifyOrganizationName } from '@/lib/organizations/organization-slug';

async function buildUniqueSlug(
  inputSlug: string,
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
): Promise<{ slug: string | null; error: string | null }> {
  const base = slugifyOrganizationName(inputSlug);
  if (!base) {
    return { slug: null, error: 'Please provide a valid organization name.' };
  }

  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { exists, error } = await checkOrganizationSlugExists(supabase, candidate);
    if (error) return { slug: null, error };
    if (!exists) return { slug: candidate, error: null };
  }

  return { slug: null, error: 'Could not generate unique organization slug.' };
}

export async function createOrganization(
  payload: CreateOrganizationPayload,
): Promise<CreateOrganizationApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const name = String(payload.name ?? '').trim();
  if (!name) {
    return { ok: false, message: 'Organization name is required.' };
  }

  const planId = String(payload.planId ?? '').trim();
  if (!planId) {
    return { ok: false, message: 'Please select an organization plan.' };
  }

  const { data: planRow, error: planError } = await supabase
    .from('plans')
    .select('id, name')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle();

  if (planError) {
    return { ok: false, message: planError.message };
  }

  if (!planRow) {
    return { ok: false, message: 'Invalid or inactive plan selected.' };
  }

  const planName = String((planRow as { name: string }).name ?? 'Free');

  const { data: freeTierPlanId, error: freeTierError } =
    await fetchFreeTierPlanId(supabase);
  if (freeTierError) {
    return { ok: false, message: freeTierError };
  }

  const isFreeTierSelection =
    Boolean(freeTierPlanId) && planId === freeTierPlanId;

  if (isFreeTierSelection) {
    const { data: existingFree, error: existingError } =
      await fetchOwnedActiveFreeTierOrganizations(
        supabase,
        authData.user.id,
        freeTierPlanId as string,
      );

    if (existingError) {
      return { ok: false, message: existingError };
    }

    const blocking = existingFree ?? [];
    if (blocking.length > 0 && !payload.confirmPausePreviousFreeOrganizations) {
      return {
        ok: false,
        code: 'FREE_ORG_LIMIT',
        message:
          'You already have an active organization on the free plan. Creating another will pause your existing free organization.',
        previousOrganizationNames: blocking.map((o) => o.name),
      };
    }

    if (blocking.length > 0 && payload.confirmPausePreviousFreeOrganizations) {
      const { data: pausedStatusId, error: pausedStatusError } =
        await fetchPausedOrganizationStatusId(supabase);
      if (pausedStatusError || !pausedStatusId) {
        return {
          ok: false,
          message: pausedStatusError ?? 'Could not resolve paused status.',
        };
      }

      const { error: pauseError } = await setOrganizationsStatusId(
        supabase,
        blocking.map((o) => o.id),
        pausedStatusId,
      );
      if (pauseError) {
        return { ok: false, message: pauseError };
      }
    }
  }

  const slugSource = String(payload.slug ?? '').trim() || name;
  const { slug, error: slugError } = await buildUniqueSlug(slugSource, supabase);
  if (slugError || !slug) {
    return { ok: false, message: slugError ?? 'Invalid slug.' };
  }

  const { data: statusId, error: statusError } =
    await fetchDefaultOrganizationStatusId(supabase);
  if (statusError) {
    return { ok: false, message: statusError };
  }
  if (!statusId) {
    return { ok: false, message: 'No active organization status found.' };
  }

  const orgId = randomUUID();

  const { error: insertError } = await supabase
    .from('organizations')
    .insert({
      id: orgId,
      name,
      slug,
      owner_id: authData.user.id,
      status_id: statusId,
      plan_id: planId,
    });

  if (insertError) {
    return { ok: false, message: insertError.message };
  }

  const organization: OrganizationListItem = {
    id: orgId,
    name,
    slug,
    planName,
    statusName: 'active',
    projectCount: 0,
  };

  return {
    ok: true,
    message: 'Organization created successfully.',
    organization,
  };
}

