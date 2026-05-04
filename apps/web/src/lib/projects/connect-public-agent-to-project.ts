/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ConnectPublicAgentApiResult } from '@/lib/projects/project-types';
import { resolvePlanDefaultModelId } from '@/lib/connected-agents/resolve-plan-default-model';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { countAgentsConnectedToProject } from '@/lib/projects/count-project-agents';

/**
 * Inserts `public.project_agents` with required columns only:
 * `project_id`, `agent_id`, `status_id` (active). Nullable columns omitted.
 */
export async function connectPublicAgentToProjectForCurrentUser(
  projectId: string,
  agentId: string,
): Promise<ConnectPublicAgentApiResult> {
  const pid = projectId?.trim();
  const aid = agentId?.trim();
  if (!pid || !aid) {
    return {
      ok: false,
      message: 'Missing project or agent id.',
      code: 'BAD_REQUEST',
    };
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
    .select('id, title, organization_id')
    .eq('id', pid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) {
    return { ok: false, message: projectError.message };
  }

  if (!projectRow) {
    return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', projectRow.organization_id)
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

  const role = String(memberRow.role ?? '');
  if (role !== 'owner' && role !== 'admin') {
    return {
      ok: false,
      message: 'Only organization owners and admins can connect agents.',
      code: 'FORBIDDEN',
    };
  }

  const { data: agentRow, error: agentError } = await supabase
    .from('agents')
    .select('id')
    .eq('id', aid)
    .eq('is_public', true)
    .eq('is_deleted', false)
    .maybeSingle();

  if (agentError) {
    return { ok: false, message: agentError.message };
  }

  if (!agentRow) {
    return {
      ok: false,
      message: 'This agent is not available in the catalog.',
      code: 'AGENT_NOT_AVAILABLE',
    };
  }

  const { data: statusRow, error: statusError } = await supabase
    .from('agent_statuses')
    .select('id')
    .eq('name', 'active')
    .eq('is_active', true)
    .maybeSingle();

  if (statusError) {
    return { ok: false, message: statusError.message };
  }

  if (!statusRow?.id) {
    return {
      ok: false,
      message: 'Default agent status is not configured.',
    };
  }

  const { data: existingLink, error: existingError } = await supabase
    .from('project_agents')
    .select('id, is_deleted')
    .eq('project_id', pid)
    .eq('agent_id', aid)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (existingLink?.id && existingLink.is_deleted === false) {
    return {
      ok: false,
      message: 'This agent is already connected to the project.',
      code: 'ALREADY_CONNECTED',
    };
  }

  // Enforce plan-based "agents per project" limits.
  // This check is done only after we confirm the agent isn't already actively connected,
  // because connecting again would increase the active count by 1.
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('plan_id')
    .eq('id', projectRow.organization_id)
    .maybeSingle();
  if (orgError) return { ok: false, message: orgError.message };

  const planId = orgRow?.plan_id ?? null;
  const { data: planRow, error: planError } = planId
    ? await supabase
        .from('plans')
        .select('name, max_agents_per_project')
        .eq('id', planId)
        .maybeSingle()
    : { data: null, error: null };

  if (planError) return { ok: false, message: planError.message };

  const planName = String(planRow?.name ?? 'Free');
  const maxAgentsPerProject =
    typeof planRow?.max_agents_per_project === 'number'
      ? Number(planRow.max_agents_per_project)
      : -1;

  const isUnlimited = maxAgentsPerProject === -1 || maxAgentsPerProject <= 0;
  if (!isUnlimited) {
    const currentConnectedAgents = await countAgentsConnectedToProject(
      supabase,
      pid,
    );
    if (currentConnectedAgents >= maxAgentsPerProject) {
      const capText =
        maxAgentsPerProject === 1
          ? '1 connected agent'
          : `up to ${maxAgentsPerProject} connected agents`;
      return {
        ok: false,
        message: `Your ${planName} plan allows ${capText} per project. Disconnect an agent to connect more.`,
      };
    }
  }

  const defaultModelId =
    (await resolvePlanDefaultModelId(supabase, projectRow.organization_id)) ?? null;

  if (existingLink?.id && existingLink.is_deleted === true) {
    const { data: restored, error: restoreError } = await supabase
      .from('project_agents')
      .update({
        is_deleted: false,
        status_id: statusRow.id,
        model_id: defaultModelId,
        user_instruction: null,
        custom_agent_name: String(projectRow.title ?? '').trim() || null,
        config: null,
      })
      .eq('id', existingLink.id)
      .select('id')
      .single();

    if (restoreError) {
      return { ok: false, message: restoreError.message };
    }

    if (!restored?.id) {
      return { ok: false, message: 'Could not connect agent.' };
    }

    return { ok: true, projectAgentId: restored.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('project_agents')
    .insert({
      project_id: pid,
      agent_id: aid,
      status_id: statusRow.id,
      model_id: defaultModelId,
      custom_agent_name: String(projectRow.title ?? '').trim() || null,
    })
    .select('id')
    .single();

  if (insertError) {
    return { ok: false, message: insertError.message };
  }

  if (!inserted?.id) {
    return { ok: false, message: 'Could not connect agent.' };
  }

  return { ok: true, projectAgentId: inserted.id };
}
