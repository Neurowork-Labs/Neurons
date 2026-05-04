/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type {
  OrganizationProjectListItem,
  OrganizationProjectsLimits,
} from '@/lib/organizations/organization-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type PlanEmbed = {
  name: string | null;
  max_projects_per_org: number;
};

type OrgEmbed = {
  id: string;
  name: string;
  slug: string;
  is_deleted: boolean;
  organization_statuses:
    | { name: string | null }
    | { name: string | null }[]
    | null;
  plan: PlanEmbed | PlanEmbed[] | null;
};

type RawMemberRow = {
  organization_id: string;
  organizations: OrgEmbed | OrgEmbed[] | null;
};

type ProjectRow = {
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

export type ListOrganizationProjectsResult =
  | {
      ok: true;
      organization: { id: string; name: string; slug: string; statusName: string };
      projects: OrganizationProjectListItem[];
      limits: OrganizationProjectsLimits;
    }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export async function listOrganizationProjectsForCurrentUser(
  organizationId: string,
): Promise<ListOrganizationProjectsResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const userId = authData.user.id;

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select(
      `
      organization_id,
      organizations (
        id,
        name,
        slug,
        is_deleted,
        organization_statuses (
          name
        ),
        plan:plans (
          name,
          max_projects_per_org
        )
      )
    `,
    )
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) {
    return { ok: false, message: memberError.message };
  }

  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this organization.',
      code: 'FORBIDDEN',
    };
  }

  const rawOrg = (memberRow as RawMemberRow).organizations;
  const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
  if (!org || org.is_deleted) {
    return { ok: false, message: 'Organization not found.', code: 'NOT_FOUND' };
  }

  const rawPlan = org.plan;
  const planRow = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const rawStatus = org.organization_statuses;
  const statusRow = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const organizationStatusName = String(statusRow?.name ?? '—');
  const planName = String(planRow?.name ?? 'Free');
  const maxProjectsPerOrg =
    typeof planRow?.max_projects_per_org === 'number'
      ? planRow.max_projects_per_org
      : 1;

  const { data: projectRows, error: projectsError } = await supabase
    .from('projects')
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
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (projectsError) {
    return { ok: false, message: projectsError.message };
  }

  const projects: OrganizationProjectListItem[] = (projectRows ?? []).map(
    (row: ProjectRow) => {
      const st = row.project_statuses;
      const statusName = Array.isArray(st)
        ? st[0]?.name ?? '—'
        : st?.name ?? '—';
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        domain: row.domain,
        isDomainVerified: row.is_domain_verified,
        statusName,
        createdAt: row.created_at,
      };
    },
  );

  const limits: OrganizationProjectsLimits = {
    planName,
    maxProjectsPerOrg,
    projectCount: projects.length,
  };

  return {
    ok: true,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      statusName: organizationStatusName,
    },
    projects,
    limits,
  };
}
