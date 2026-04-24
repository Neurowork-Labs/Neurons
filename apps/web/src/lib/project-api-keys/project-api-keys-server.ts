/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  generateRawProjectApiKey,
  hashProjectApiKey,
  keyPrefixFromPlaintext,
} from '@/lib/project-api-keys/project-api-keys-crypto';
import type {
  ProjectApiKeyCreateApiResult,
  ProjectApiKeyListItem,
  ProjectApiKeysListApiResult,
} from '@/lib/project-api-keys/project-api-keys-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

type ProjectOrgRow = { id: string; organization_id: string; is_domain_verified: boolean };

function canManageFromRole(role: string): boolean {
  const r = String(role ?? '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

function rowToListItem(row: {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}): ProjectApiKeyListItem {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function loadProjectOrg(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ ok: true; row: ProjectOrgRow } | { ok: false; message: string; code?: 'NOT_FOUND' }> {
  const trimmed = String(projectId ?? '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Missing project id.', code: 'NOT_FOUND' };
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, organization_id, is_domain_verified')
    .eq('id', trimmed)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  return { ok: true, row: data as ProjectOrgRow };
}

async function getMemberRoleForOrg(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<{ ok: true; role: string } | { ok: false; message: string; code?: 'FORBIDDEN' }> {
  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
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

  return { ok: true, role: String(memberRow.role ?? '') };
}

export async function listProjectApiKeysForCurrentUser(
  projectId: string,
  query: { page?: number; pageSize?: number; search?: string },
): Promise<ProjectApiKeysListApiResult> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const searchRaw = String(query.search ?? '').trim();

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const loaded = await loadProjectOrg(supabase, projectId);
  if (!loaded.ok) {
    if (loaded.code === 'NOT_FOUND') return { ok: false, message: loaded.message, code: 'NOT_FOUND' };
    return { ok: false, message: loaded.message };
  }

  const member = await getMemberRoleForOrg(
    supabase,
    authData.user.id,
    loaded.row.organization_id,
  );
  if (!member.ok) {
    if (member.code === 'FORBIDDEN') return { ok: false, message: member.message, code: 'FORBIDDEN' };
    return { ok: false, message: member.message };
  }

  const canManage = canManageFromRole(member.role);
  if (!canManage) {
    return {
      ok: true,
      canManage: false,
      isDomainVerified: Boolean(loaded.row.is_domain_verified),
      keys: [],
      total: 0,
      page: 1,
      pageSize,
    };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let listQuery = supabase
    .from('project_api_keys')
    .select(
      'id, name, key_prefix, last_used_at, expires_at, is_active, created_at',
      { count: 'exact' },
    )
    .eq('project_id', loaded.row.id)
    .order('created_at', { ascending: false });

  const safeSearch = searchRaw.replace(/[%_\\]/g, '').slice(0, 200);
  if (safeSearch) {
    listQuery = listQuery.ilike('name', `%${safeSearch}%`);
  }

  const { data, error, count } = await listQuery.range(from, to);

  if (error) return { ok: false, message: error.message };

  const keys = (data ?? []).map((row) =>
    rowToListItem(
      row as {
        id: string;
        name: string;
        key_prefix: string;
        last_used_at: string | null;
        expires_at: string | null;
        is_active: boolean;
        created_at: string;
      },
    ),
  );

  return {
    ok: true,
    canManage: true,
    isDomainVerified: Boolean(loaded.row.is_domain_verified),
    keys,
    total: count ?? 0,
    page,
    pageSize,
  };
}

function parseExpiresAt(value: unknown): string | null | { error: string } {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return { error: 'Invalid expiration.' };
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { error: 'Invalid expiration date.' };
  }
  if (d.getTime() <= Date.now()) {
    return { error: 'Expiration must be in the future.' };
  }
  return d.toISOString();
}

export async function createProjectApiKeyForCurrentUser(
  projectId: string,
  body: {
    name: string;
    expiresAt: string | null;
    confirmDeactivateOtherActiveKeys?: boolean;
  },
): Promise<ProjectApiKeyCreateApiResult> {
  const name = String(body.name ?? '').trim();
  if (!name) {
    return { ok: false, message: 'Key name is required.', code: 'BAD_REQUEST' };
  }

  const expiresParsed = parseExpiresAt(body.expiresAt);
  if (typeof expiresParsed === 'object' && expiresParsed !== null && 'error' in expiresParsed) {
    return { ok: false, message: expiresParsed.error, code: 'BAD_REQUEST' };
  }
  const expiresAtIso = expiresParsed as string | null;

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const loaded = await loadProjectOrg(supabase, projectId);
  if (!loaded.ok) {
    if (loaded.code === 'NOT_FOUND') return { ok: false, message: loaded.message, code: 'NOT_FOUND' };
    return { ok: false, message: loaded.message };
  }

  const member = await getMemberRoleForOrg(
    supabase,
    authData.user.id,
    loaded.row.organization_id,
  );
  if (!member.ok) {
    if (member.code === 'FORBIDDEN') return { ok: false, message: member.message, code: 'FORBIDDEN' };
    return { ok: false, message: member.message };
  }

  if (!canManageFromRole(member.role)) {
    return {
      ok: false,
      message: 'Only organization owners and admins can create API keys.',
      code: 'FORBIDDEN',
    };
  }
  if (!loaded.row.is_domain_verified) {
    return {
      ok: false,
      message: 'Verify this project domain before creating API keys.',
      code: 'BAD_REQUEST',
    };
  }

  const { count: activeCount, error: countError } = await supabase
    .from('project_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', loaded.row.id)
    .eq('is_active', true);

  if (countError) return { ok: false, message: countError.message };

  const hasActive = (activeCount ?? 0) > 0;
  if (hasActive && !body.confirmDeactivateOtherActiveKeys) {
    return {
      ok: false,
      message:
        'This project already has an active API key. Creating a new one will deactivate the current active key.',
      code: 'ACTIVE_KEY_EXISTS',
    };
  }

  if (hasActive && body.confirmDeactivateOtherActiveKeys) {
    const { error: deactivateError } = await supabase
      .from('project_api_keys')
      .update({ is_active: false })
      .eq('project_id', loaded.row.id)
      .eq('is_active', true);

    if (deactivateError) return { ok: false, message: deactivateError.message };
  }

  const plaintext = generateRawProjectApiKey();
  const keyHash = hashProjectApiKey(plaintext);
  const keyPrefix = keyPrefixFromPlaintext(plaintext);

  const insertRow = {
    project_id: loaded.row.id,
    name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    expires_at: expiresAtIso,
    is_active: true,
    last_used_at: null as string | null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('project_api_keys')
    .insert(insertRow)
    .select('id, name, key_prefix, last_used_at, expires_at, is_active, created_at')
    .maybeSingle();

  if (insertError) return { ok: false, message: insertError.message };
  if (!inserted) {
    return { ok: false, message: 'Could not create API key.' };
  }

  return {
    ok: true,
    plaintextKey: plaintext,
    key: rowToListItem(
      inserted as {
        id: string;
        name: string;
        key_prefix: string;
        last_used_at: string | null;
        expires_at: string | null;
        is_active: boolean;
        created_at: string;
      },
    ),
  };
}
