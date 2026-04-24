/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { hashProjectApiKey } from '@/lib/project-api-keys/project-api-keys-crypto';
import { normalizeProjectDomain } from '@/lib/organizations/project-domain';
import { hostsMatch, originHostname } from '@/lib/public-rag/parse-origin-host';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type VerifyPublicRagRequestResult =
  | {
      ok: true;
      projectId: string;
      organizationId: string;
      projectDomain: string;
    }
  | { ok: false; status: number; message: string };

/**
 * Validates project API key (X-API-Key) and that the request Origin host matches
 * `public.projects.domain` for the linked project.
 */
export async function verifyPublicRagRequest(
  apiKeyPlaintext: string | null | undefined,
  originHeader: string | null | undefined,
): Promise<VerifyPublicRagRequestResult> {
  const key = String(apiKeyPlaintext ?? '').trim();
  if (!key) {
    return { ok: false, status: 401, message: 'Missing API key.' };
  }

  const requestHost = originHostname(originHeader ?? null);
  if (!requestHost) {
    return { ok: false, status: 400, message: 'Missing or invalid Origin.' };
  }

  const supabase = getSupabaseServiceRoleClient();
  const keyHash = hashProjectApiKey(key);

  const { data: keyRow, error: keyErr } = await supabase
    .from('project_api_keys')
    .select('id, project_id, is_active, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (keyErr) {
    return { ok: false, status: 500, message: keyErr.message };
  }
  if (!keyRow || !keyRow.is_active) {
    return { ok: false, status: 403, message: 'Invalid API key.' };
  }
  if (keyRow.expires_at) {
    const exp = new Date(String(keyRow.expires_at)).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      return { ok: false, status: 403, message: 'API key expired.' };
    }
  }

  const projectId = String(keyRow.project_id);

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, organization_id, domain, is_deleted, is_domain_verified')
    .eq('id', projectId)
    .maybeSingle();

  if (projErr) {
    return { ok: false, status: 500, message: projErr.message };
  }
  if (!project || project.is_deleted) {
    return { ok: false, status: 404, message: 'Project not found.' };
  }

  if (!Boolean(project.is_domain_verified)) {
    return { ok: false, status: 403, message: 'Project domain is not verified.' };
  }

  const domainRaw = project.domain as string | null;
  if (!domainRaw) {
    return { ok: false, status: 403, message: 'Project domain is not configured.' };
  }

  const projectDomain = normalizeProjectDomain(domainRaw);
  if (!hostsMatch(projectDomain, requestHost)) {
    return { ok: false, status: 403, message: 'Origin does not match project domain.' };
  }

  void supabase
    .from('project_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id);

  return {
    ok: true,
    projectId,
    organizationId: String(project.organization_id),
    projectDomain,
  };
}
