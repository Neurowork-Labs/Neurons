/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { OrganizationProjectListItem } from '@/lib/organizations/organization-types';
import { countAgentExecutionsForProject } from '@/lib/projects/count-agent-executions-for-project';
import { countAgentsConnectedToProject } from '@/lib/projects/count-project-agents';
import { formatPlanSupportTypeLabel } from '@/lib/projects/plan-support-label';
import type { ProjectContextApiResult } from '@/lib/projects/project-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type SupportTypeEmbed = {
  name: string | null;
};

type PlanEmbed = {
  name: string | null;
  max_projects_per_org: number;
  support_types?: SupportTypeEmbed | SupportTypeEmbed[] | null;
};

type OrgEmbed = {
  id: string;
  name: string;
  slug: string;
  is_deleted: boolean;
  plan: PlanEmbed | PlanEmbed[] | null;
};

type MemberRow = {
  organizations: OrgEmbed | OrgEmbed[] | null;
};

type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  is_domain_verified: boolean;
  created_at: string;
  organization_id: string;
  project_statuses:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

export async function getProjectContextForCurrentUser(
  projectId: string,
): Promise<ProjectContextApiResult> {
  const trimmed = projectId?.trim();
  if (!trimmed) {
    return { ok: false, message: 'Missing project id.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const userId = authData.user.id;

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select(
      `
      id,
      title,
      description,
      domain,
      is_domain_verified,
      created_at,
      organization_id,
      project_statuses (
        name
      )
    `,
    )
    .eq('id', trimmed)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) {
    return { ok: false, message: projectError.message };
  }

  if (!projectRow) {
    return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };
  }

  const row = projectRow as ProjectRow;

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select(
      `
      organizations (
        id,
        name,
        slug,
        is_deleted,
        plan:plans (
          name,
          max_projects_per_org,
          support_types!support_type_id (
            name
          )
        )
      )
    `,
    )
    .eq('user_id', userId)
    .eq('organization_id', row.organization_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) {
    return { ok: false, message: memberError.message };
  }

  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this project.',
      code: 'FORBIDDEN',
    };
  }

  const rawOrg = (memberRow as MemberRow).organizations;
  const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
  if (!org || org.is_deleted) {
    return { ok: false, message: 'Organization not found.', code: 'NOT_FOUND' };
  }

  const rawPlan = org.plan;
  const planRow = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const planName = String(planRow?.name ?? 'Free');

  const rawSupport = planRow?.support_types;
  const supportRow = Array.isArray(rawSupport) ? rawSupport[0] : rawSupport;
  const planSupportTypeLabel = formatPlanSupportTypeLabel(supportRow?.name);

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

  const [agentsConnectedCount, totalExecutionsCount] = await Promise.all([
    countAgentsConnectedToProject(supabase, trimmed),
    countAgentExecutionsForProject(supabase, trimmed),
  ]);

  return {
    ok: true,
    organization: { id: org.id, name: org.name, slug: org.slug },
    limits: { planName },
    project,
    agentsConnectedCount,
    totalExecutionsCount,
    planSupportTypeLabel,
  };
}
