/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { randomBytes } from 'crypto';

import type {
  CreateOrganizationProjectApiResult,
  CreateOrganizationProjectPayload,
  OrganizationProjectListItem,
} from '@/lib/organizations/organization-types';
import {
  isValidProjectDomain,
  normalizeProjectDomain,
} from '@/lib/organizations/project-domain';
import { listOrganizationProjectsForCurrentUser } from '@/lib/organizations/list-organization-projects-for-current-user';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function buildVerificationToken(): string {
  return `ae_verify_${randomBytes(16).toString('hex')}`;
}

export async function createOrganizationProject(
  organizationId: string,
  payload: CreateOrganizationProjectPayload,
): Promise<CreateOrganizationProjectApiResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const title = String(payload.title ?? '').trim();
  if (!title) {
    return { ok: false, message: 'Project title is required.' };
  }

  const domainRaw = String(payload.domain ?? '').trim();
  if (!domainRaw) {
    return {
      ok: false,
      message: 'Please enter a domain for this project.',
      code: 'DOMAIN_REQUIRED',
    };
  }

  if (!isValidProjectDomain(domainRaw)) {
    return {
      ok: false,
      message:
        'Enter a valid domain (e.g. example.com or app.example.com). No URL, path, or port.',
      code: 'INVALID_DOMAIN',
    };
  }

  const domain = normalizeProjectDomain(domainRaw);

  const description =
    payload.description != null && String(payload.description).trim() !== ''
      ? String(payload.description).trim()
      : null;

  const listResult = await listOrganizationProjectsForCurrentUser(organizationId);
  if (!listResult.ok) {
    if (listResult.code === 'FORBIDDEN') {
      return { ok: false, message: listResult.message, code: 'FORBIDDEN' };
    }
    if (listResult.code === 'NOT_FOUND') {
      return { ok: false, message: listResult.message, code: 'FORBIDDEN' };
    }
    return { ok: false, message: listResult.message };
  }

  const { maxProjectsPerOrg, projectCount, planName } = listResult.limits;
  const organizationStatus = String(listResult.organization.statusName ?? '').trim().toLowerCase();
  if (organizationStatus !== 'active') {
    return {
      ok: false,
      code: 'ORG_INACTIVE',
      message: 'Projects can only be created when the organization is active.',
    };
  }
  if (maxProjectsPerOrg !== -1 && projectCount >= maxProjectsPerOrg) {
    const cap =
      maxProjectsPerOrg === 1
        ? 'one project'
        : `up to ${maxProjectsPerOrg} projects`;
    return {
      ok: false,
      code: 'PROJECT_LIMIT',
      message: `Your ${planName} plan allows ${cap} per organization. Upgrade your plan to add more.`,
    };
  }

  const titleLower = title.toLowerCase();

  const duplicateTitleInOrg = listResult.projects.some(
    (p) => p.title.trim().toLowerCase() === titleLower,
  );
  if (duplicateTitleInOrg) {
    return {
      ok: false,
      code: 'DUPLICATE_PROJECT',
      message:
        'A project with this name already exists in this organization. Choose a different title.',
    };
  }

  const { data: existingDomainRow, error: domainLookupError } = await supabase
    .from('projects')
    .select('id')
    .eq('domain', domain)
    .eq('is_deleted', false)
    .maybeSingle();

  if (domainLookupError) {
    return { ok: false, message: domainLookupError.message };
  }

  if (existingDomainRow) {
    return {
      ok: false,
      message: 'This domain is already used by another project.',
      code: 'DUPLICATE_DOMAIN',
    };
  }

  const { data: statusRow, error: statusError } = await supabase
    .from('project_statuses')
    .select('id')
    .eq('name', 'active')
    .eq('is_active', true)
    .maybeSingle();

  if (statusError || !statusRow) {
    return {
      ok: false,
      message: statusError?.message ?? 'Could not resolve default project status.',
    };
  }

  const statusId = (statusRow as { id: string }).id;
  const verificationToken = buildVerificationToken();

  const { data: inserted, error: insertError } = await supabase
    .from('projects')
    .insert({
      organization_id: organizationId,
      title,
      description,
      domain,
      verification_token: verificationToken,
      is_domain_verified: false,
      status_id: statusId,
      is_deleted: false,
    })
    .select(
      `
      id,
      title,
      description,
      domain,
      is_domain_verified,
      created_at,
      project_statuses (
        name
      )
    `,
    )
    .single();

  if (insertError) {
    const msg = insertError.message ?? 'Could not create project.';
    const code = (insertError as { code?: string }).code;
    if (
      code === '23505' ||
      msg.includes('idx_projects_domain') ||
      msg.includes('projects_domain') ||
      msg.toLowerCase().includes('unique')
    ) {
      return {
        ok: false,
        message: 'This domain is already used by another project.',
        code: 'DUPLICATE_DOMAIN',
      };
    }
    return { ok: false, message: msg };
  }

  const row = inserted as {
    id: string;
    title: string;
    description: string | null;
    domain: string | null;
    is_domain_verified: boolean;
    created_at: string;
    project_statuses:
      | { name: string | null }
      | { name: string | null }[]
      | null;
  };

  const st = row.project_statuses;
  const statusName = Array.isArray(st)
    ? st[0]?.name ?? '—'
    : st?.name ?? '—';

  const project: OrganizationProjectListItem = {
    id: row.id,
    title: row.title,
    description: row.description,
    domain: row.domain,
    isDomainVerified: row.is_domain_verified,
    statusName,
    createdAt: row.created_at,
  };

  return {
    ok: true,
    message: 'Project created successfully.',
    project,
  };
}
