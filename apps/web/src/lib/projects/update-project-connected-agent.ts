/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { UpdateConnectedAgentApiResult } from '@/lib/connected-agents/connected-agents-types';
import { normalizeWidgetRequiredContactFields, validateWidgetRequiredContactFields } from '@/lib/connected-agents/widget-contact-fields-config';
import { normalizeWidgetLauncherIconConfig, validateWidgetLauncherIconConfig } from '@/lib/connected-agents/widget-launcher-icon-config';
import { normalizeWidgetThemeColor, validateWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';
import { resolvePlanDefaultModelId } from '@/lib/connected-agents/resolve-plan-default-model';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type StatusRow = { id: string; name: string };

type ProjectAgentRow = {
  id: string;
  project_id: string;
  agent_id: string;
  custom_agent_name: string | null;
  status_id: string;
  model_id: string | null;
  user_instruction: string | null;
  greeting: string | null;
  customAgentName: string | null;
  config: unknown | null;
  updated_at: string | null;
  project_agent_widget_configs:
    | {
        icon_mode: string | null;
        lucide_icon: string | null;
        custom_icon_url: string | null;
        widget_theme_color: string | null;
        required_contact_fields: unknown;
      }
    | {
        icon_mode: string | null;
        lucide_icon: string | null;
        custom_icon_url: string | null;
        widget_theme_color: string | null;
        required_contact_fields: unknown;
      }[]
    | null;
  projects:
    | {
        id: string;
        title: string;
        organization_id: string;
      }
    | {
        id: string;
        title: string;
        organization_id: string;
      }[]
    | null;
  agents:
    | {
        id: string;
        name: string;
        display_name: string;
        description: string | null;
        version: string;
        system_instruction: string;
        config_schema: unknown | null;
        agent_types:
          | { display_name: string | null }
          | { display_name: string | null }[]
          | null;
      }
    | {
        id: string;
        name: string;
        display_name: string;
        description: string | null;
        version: string;
        system_instruction: string;
        config_schema: unknown | null;
        agent_types:
          | { display_name: string | null }
          | { display_name: string | null }[]
          | null;
      }[]
    | null;
};

type ModelRow = {
  id: string;
  model_tier_id: string;
};

type PlanRow = {
  max_model_tier_index: number;
};

type ModelTierRow = {
  id: string;
  min_plan_index: number;
};

function firstEmbed<T>(embed: T | T[] | null): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

export async function updateProjectConnectedAgentForCurrentUser(params: {
  projectId: string;
  projectAgentId: string;
  statusId: string;
  modelId: string | null;
  userInstruction: string | null;
  greeting: string | null;
  customAgentName: string | null;
  config: unknown | null;
  widgetLauncherIcon: {
    mode?: unknown;
    lucideIcon?: unknown;
    customIconUrl?: unknown;
  } | null;
  widgetThemeColor: unknown;
  requiredContactFields: unknown;
}): Promise<UpdateConnectedAgentApiResult> {
  const projectId = params.projectId?.trim();
  const projectAgentId = params.projectAgentId?.trim();
  const statusId = params.statusId?.trim();
  const modelId = params.modelId?.trim() || null;
  const userInstruction = params.userInstruction;
  const greeting = params.greeting;
  const customAgentName =
    typeof params.customAgentName === 'string' ? params.customAgentName.trim() : null;
  const config = params.config;
  const iconInput = params.widgetLauncherIcon;
  const widgetThemeColorInput = params.widgetThemeColor;
  const requiredContactFieldsInput = params.requiredContactFields;

  if (!projectId || !projectAgentId || !statusId) {
    return {
      ok: false,
      message: 'Missing required fields.',
      code: 'BAD_REQUEST',
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: projectAgentRow, error: projectAgentError } = await supabase
    .from('project_agents')
    .select(
      `
      id,
      project_id,
      agent_id,
      custom_agent_name,
      updated_at,
      status_id,
      model_id,
      user_instruction,
      greeting,
      config,
      project_agent_widget_configs (
        icon_mode,
        lucide_icon,
        custom_icon_url,
        widget_theme_color,
        required_contact_fields
      ),
      projects!project_agents_project_id_fkey (
        id,
        title,
        organization_id
      ),
      agents!project_agents_agent_id_fkey (
        id,
        name,
        display_name,
        description,
        version,
        system_instruction,
        config_schema,
        agent_types (
          display_name
        )
      )
    `,
    )
    .eq('id', projectAgentId)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectAgentError) return { ok: false, message: projectAgentError.message };
  if (!projectAgentRow) {
    return { ok: false, message: 'Connected agent not found.', code: 'NOT_FOUND' };
  }

  const projectAgent = projectAgentRow as ProjectAgentRow;
  const project = firstEmbed(projectAgent.projects);
  if (!project) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', authData.user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) return { ok: false, message: memberError.message };
  const memberRole = String(memberRow?.role ?? '');
  if (memberRole !== 'owner' && memberRole !== 'admin') {
    return {
      ok: false,
      message: 'Only organization owners and admins can update connected agents.',
      code: 'FORBIDDEN',
    };
  }

  const { data: statusRow, error: statusError } = await supabase
    .from('agent_statuses')
    .select('id, name')
    .eq('id', statusId)
    .eq('is_active', true)
    .maybeSingle();

  if (statusError) return { ok: false, message: statusError.message };
  if (!statusRow) {
    return { ok: false, message: 'Invalid status.', code: 'BAD_REQUEST' };
  }

  const statusName = String((statusRow as StatusRow).name ?? '').toLowerCase();
  if (statusName !== 'active' && statusName !== 'inactive') {
    return { ok: false, message: 'Only active/inactive status is allowed.', code: 'BAD_REQUEST' };
  }

  let resolvedModelId: string | null = modelId;

  if (resolvedModelId == null) {
    resolvedModelId =
      (await resolvePlanDefaultModelId(supabase, project.organization_id)) ?? null;
  }

  if (resolvedModelId != null) {
    const { data: orgRow, error: orgError } = await supabase
      .from('organizations')
      .select('plan_id')
      .eq('id', project.organization_id)
      .maybeSingle();

    if (orgError) return { ok: false, message: orgError.message };
    if (!orgRow?.plan_id) {
      return { ok: false, message: 'Organization plan not found.', code: 'BAD_REQUEST' };
    }

    const { data: planRow, error: planError } = await supabase
      .from('plans')
      .select('max_model_tier_index')
      .eq('id', orgRow.plan_id)
      .maybeSingle();

    if (planError) return { ok: false, message: planError.message };
    if (!planRow) {
      return { ok: false, message: 'Organization plan not found.', code: 'BAD_REQUEST' };
    }

    const { data: modelRow, error: modelError } = await supabase
      .from('models')
      .select('id, model_tier_id')
      .eq('id', resolvedModelId)
      .eq('is_active', true)
      .maybeSingle();

    if (modelError) return { ok: false, message: modelError.message };
    if (!modelRow) {
      return { ok: false, message: 'Invalid model.', code: 'BAD_REQUEST' };
    }

    const { data: modelTierRow, error: tierError } = await supabase
      .from('model_tiers')
      .select('id, min_plan_index')
      .eq('id', (modelRow as ModelRow).model_tier_id)
      .eq('is_active', true)
      .maybeSingle();

    if (tierError) return { ok: false, message: tierError.message };
    if (!modelTierRow) {
      return { ok: false, message: 'Invalid model tier.', code: 'BAD_REQUEST' };
    }

    const maxTierIndex = Number((planRow as PlanRow).max_model_tier_index ?? -1);
    const modelMinIndex = Number((modelTierRow as ModelTierRow).min_plan_index ?? 999);
    if (modelMinIndex > maxTierIndex) {
      return { ok: false, message: 'Model is not available on this plan.', code: 'BAD_REQUEST' };
    }
  }

  const iconValidation = validateWidgetLauncherIconConfig(iconInput);
  if (!iconValidation.ok) {
    return { ok: false, message: iconValidation.message, code: 'BAD_REQUEST' };
  }
  const iconValue = iconValidation.value;
  const contactFieldValidation = validateWidgetRequiredContactFields(requiredContactFieldsInput);
  if (!contactFieldValidation.ok) {
    return { ok: false, message: contactFieldValidation.message, code: 'BAD_REQUEST' };
  }
  const requiredContactFields = contactFieldValidation.value;
  const themeColorValidation = validateWidgetThemeColor(widgetThemeColorInput);
  if (!themeColorValidation.ok) {
    return { ok: false, message: themeColorValidation.message, code: 'BAD_REQUEST' };
  }
  const widgetThemeColor = themeColorValidation.value;

  const { data: updatedRow, error: updateError } = await supabase
    .from('project_agents')
    .update({
      status_id: statusId,
      model_id: resolvedModelId,
      user_instruction: userInstruction,
      greeting,
      custom_agent_name:
        customAgentName && customAgentName.length > 0 ? customAgentName : null,
      config,
    })
    .eq('id', projectAgentId)
    .eq('project_id', projectId)
    .select(
      `
      id,
      agent_id,
      custom_agent_name,
      status_id,
      model_id,
      user_instruction,
      greeting,
      config,
      agents!project_agents_agent_id_fkey (
        id,
        name,
        display_name,
        description,
        version,
        system_instruction,
        config_schema,
        agent_types (
          display_name
        )
      ),
      agent_statuses!project_agents_status_id_fkey (
        name
      )
    `,
    )
    .single();

  if (updateError) return { ok: false, message: updateError.message };

  const { error: upsertWidgetIconError } = await supabase
    .from('project_agent_widget_configs')
    .upsert(
      {
        project_agent_id: projectAgentId,
        icon_mode: iconValue.mode,
        lucide_icon: iconValue.lucideIcon,
        custom_icon_url: iconValue.customIconUrl,
        widget_theme_color: widgetThemeColor,
        required_contact_fields: requiredContactFields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_agent_id' },
    );
  if (upsertWidgetIconError) return { ok: false, message: upsertWidgetIconError.message };

  const { data: widgetRow, error: widgetRowError } = await supabase
    .from('project_agent_widget_configs')
    .select('icon_mode, lucide_icon, custom_icon_url, widget_theme_color, required_contact_fields')
    .eq('project_agent_id', projectAgentId)
    .maybeSingle();
  if (widgetRowError) return { ok: false, message: widgetRowError.message };

  const updatedAgent = updatedRow as unknown as {
    id: string;
    agent_id: string;
    custom_agent_name: string | null;
    status_id: string;
    model_id: string | null;
    user_instruction: string | null;
    greeting: string | null;
    config: unknown | null;
    updated_at: string | null;
    project_agent_widget_configs: ProjectAgentRow['project_agent_widget_configs'];
    agents: ProjectAgentRow['agents'];
    agent_statuses: { name: string | null } | { name: string | null }[] | null;
  };
  const agent = firstEmbed(updatedAgent.agents);
  const type = firstEmbed(agent?.agent_types ?? null);
  const status = firstEmbed(updatedAgent.agent_statuses);
  const iconConfig = normalizeWidgetLauncherIconConfig({
    mode: widgetRow?.icon_mode ?? null,
    lucideIcon: widgetRow?.lucide_icon ?? null,
    customIconUrl: widgetRow?.custom_icon_url ?? null,
  });
  const requiredFields = normalizeWidgetRequiredContactFields(
    widgetRow?.required_contact_fields ?? null,
  );

  return {
    ok: true,
    agent: {
      projectAgentId: updatedAgent.id,
      agentId: updatedAgent.agent_id,
      customAgentName: updatedAgent.custom_agent_name,
      name: agent?.name ?? '—',
      displayName: agent?.display_name ?? '—',
      description: agent?.description ?? null,
      version: agent?.version ?? '1.0.0',
      typeDisplayName: type?.display_name?.trim() || '—',
      systemInstruction: agent?.system_instruction ?? '',
      updatedAt: updatedAgent.updated_at ?? null,
      statusId: updatedAgent.status_id,
      statusName: status?.name?.trim() || 'unknown',
      userInstruction: updatedAgent.user_instruction,
      greeting: updatedAgent.greeting,
      modelId: updatedAgent.model_id,
      config: updatedAgent.config,
      configSchema: agent?.config_schema ?? null,
      widgetLauncherIconMode: iconConfig.mode,
      widgetLauncherIconLucide: iconConfig.lucideIcon,
      widgetLauncherIconCustomUrl: iconConfig.customIconUrl,
      widgetThemeColor: normalizeWidgetThemeColor(widgetRow?.widget_theme_color ?? null),
      widgetRequiredContactFields: requiredFields,
    },
  };
}
