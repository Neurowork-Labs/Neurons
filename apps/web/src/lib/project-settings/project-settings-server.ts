/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ProjectSettingsGetApiResult,
  ProjectSettingsPatchApiResult,
  ProjectSettingsPayload,
  ProjectSoftDeleteApiResult,
} from '@/lib/project-settings/project-settings-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ProjectStatusEmbed = { name: string | null } | { name: string | null }[] | null;

type ProjectSettingsRow = {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  is_domain_verified: boolean;
  domain_verified_at: string | null;
  organization_id: string;
  project_statuses: ProjectStatusEmbed;
};

function statusNameFromRow(row: ProjectSettingsRow): string {
  const st = row.project_statuses;
  if (Array.isArray(st)) return st[0]?.name ?? '—';
  return st?.name ?? '—';
}

function canManageFromRole(role: string): boolean {
  const r = String(role ?? '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

function rowToPayload(row: ProjectSettingsRow, canManage: boolean): ProjectSettingsPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    domain: row.domain,
    statusName: statusNameFromRow(row),
    isDomainVerified: row.is_domain_verified,
    domainVerifiedAt: row.domain_verified_at,
    canManage,
  };
}

async function loadProjectSettingsRow(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ ok: true; row: ProjectSettingsRow } | { ok: false; message: string; code?: 'NOT_FOUND' }> {
  const trimmed = String(projectId ?? '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Missing project id.', code: 'NOT_FOUND' };
  }

  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      id,
      title,
      description,
      domain,
      is_domain_verified,
      domain_verified_at,
      organization_id,
      project_statuses (
        name
      )
    `,
    )
    .eq('id', trimmed)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  return { ok: true, row: data as ProjectSettingsRow };
}

export async function getProjectSettingsForCurrentUser(
  projectId: string,
): Promise<ProjectSettingsGetApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const loaded = await loadProjectSettingsRow(supabase, projectId);
  if (!loaded.ok) {
    if (loaded.code === 'NOT_FOUND') return { ok: false, message: loaded.message, code: 'NOT_FOUND' };
    return { ok: false, message: loaded.message };
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('organization_id', loaded.row.organization_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) return { ok: false, message: memberError.message };
  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this project.',
      code: 'FORBIDDEN',
    };
  }

  const canManage = canManageFromRole(String(memberRow.role ?? ''));
  return {
    ok: true,
    settings: rowToPayload(loaded.row, canManage),
  };
}

export async function updateProjectSettingsForCurrentUser(
  projectId: string,
  payload: { title: string; description?: string | null },
): Promise<ProjectSettingsPatchApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const title = String(payload.title ?? '').trim();
  if (!title) {
    return { ok: false, message: 'Project title is required.', code: 'BAD_REQUEST' };
  }

  const descriptionUpdate =
    payload.description === undefined
      ? undefined
      : payload.description != null && String(payload.description).trim() !== ''
        ? String(payload.description).trim()
        : null;

  const loaded = await loadProjectSettingsRow(supabase, projectId);
  if (!loaded.ok) {
    if (loaded.code === 'NOT_FOUND') return { ok: false, message: loaded.message, code: 'NOT_FOUND' };
    return { ok: false, message: loaded.message };
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('organization_id', loaded.row.organization_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) return { ok: false, message: memberError.message };
  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this project.',
      code: 'FORBIDDEN',
    };
  }

  if (!canManageFromRole(String(memberRow.role ?? ''))) {
    return {
      ok: false,
      message: 'Only organization owners and admins can update project settings.',
      code: 'FORBIDDEN',
    };
  }

  const patch: { title: string; description?: string | null } = { title };
  if (descriptionUpdate !== undefined) {
    patch.description = descriptionUpdate;
  }

  const { data: updated, error: updateError } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', loaded.row.id)
    .eq('is_deleted', false)
    .select(
      `
      id,
      title,
      description,
      domain,
      is_domain_verified,
      domain_verified_at,
      organization_id,
      project_statuses (
        name
      )
    `,
    )
    .maybeSingle();

  if (updateError) return { ok: false, message: updateError.message };
  if (!updated) {
    return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };
  }

  return {
    ok: true,
    settings: rowToPayload(updated as ProjectSettingsRow, true),
  };
}

export async function softDeleteProjectForCurrentUser(
  projectId: string,
  confirmProjectTitle: string,
): Promise<ProjectSoftDeleteApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const confirmation = String(confirmProjectTitle ?? '').trim();
  if (!confirmation) {
    return {
      ok: false,
      message: 'Enter the project name to confirm deletion.',
      code: 'BAD_REQUEST',
    };
  }

  const loaded = await loadProjectSettingsRow(supabase, projectId);
  if (!loaded.ok) {
    if (loaded.code === 'NOT_FOUND') return { ok: false, message: loaded.message, code: 'NOT_FOUND' };
    return { ok: false, message: loaded.message };
  }

  const expectedTitle = String(loaded.row.title ?? '').trim();
  if (confirmation !== expectedTitle) {
    return {
      ok: false,
      message: 'The name you entered does not match this project.',
      code: 'TITLE_MISMATCH',
    };
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('organization_id', loaded.row.organization_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) return { ok: false, message: memberError.message };
  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this project.',
      code: 'FORBIDDEN',
    };
  }

  if (!canManageFromRole(String(memberRow.role ?? ''))) {
    return {
      ok: false,
      message: 'Only organization owners and admins can delete a project.',
      code: 'FORBIDDEN',
    };
  }

  const { error: deleteError } = await supabase
    .from('projects')
    .update({ is_deleted: true })
    .eq('id', loaded.row.id)
    .eq('is_deleted', false);

  if (deleteError) return { ok: false, message: deleteError.message };

  return { ok: true };
}
