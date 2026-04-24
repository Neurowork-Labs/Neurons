/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type {
  ConnectedAgentItem,
  ConnectedAgentsListApiResult,
  ConnectedAgentModelOption,
  ConnectedAgentStatusOption,
} from '@/lib/connected-agents/connected-agents-types';
import { normalizeWidgetRequiredContactFields } from '@/lib/connected-agents/widget-contact-fields-config';
import { normalizeWidgetLauncherIconConfig } from '@/lib/connected-agents/widget-launcher-icon-config';
import { normalizeWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ProjectRow = {
  id: string;
  title: string;
  organization_id: string;
  organizations: { plan_id: string | null } | { plan_id: string | null }[] | null;
};

type MemberRow = { role: string };

type StatusRow = { id: string; name: string };

type ModelTierRow = { id: string; min_plan_index: number };

type ModelRow = {
  id: string;
  name: string;
  display_name: string;
  model_tier_id: string;
};

type UrlRow = {
  id: string;
  url_key: string;
  url_value: string;
};

type ApiKeyPrefixRow = {
  key_prefix: string;
};

type PlanRow = {
  max_model_tier_index: number | null;
  default_model_id: string | null;
};

type DefaultModelNameRow = {
  display_name: string | null;
};

type ProjectAgentRow = {
  id: string;
  agent_id: string;
  custom_agent_name: string | null;
  status_id: string;
  model_id: string | null;
  user_instruction: string | null;
  greeting: string | null;
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
  agent_statuses: { name: string | null } | { name: string | null }[] | null;
};

function firstEmbed<T>(embed: T | T[] | null): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function normalizeRoleAllowed(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export async function listProjectConnectedAgentsCatalogForCurrentUser(
  projectId: string,
): Promise<ConnectedAgentsListApiResult> {
  const pid = projectId?.trim();
  if (!pid) {
    return { ok: false, message: 'Missing project id.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select(
      `
      id,
      title,
      organization_id,
      organizations!projects_organization_id_fkey (
        plan_id
      )
    `,
    )
    .eq('id', pid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) return { ok: false, message: projectError.message };
  if (!projectRow) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const project = projectRow as ProjectRow;
  const orgEmbed = firstEmbed(project.organizations);
  const planId = orgEmbed?.plan_id ?? null;

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('organization_id', project.organization_id)
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

  const role = String((memberRow as MemberRow).role ?? '');
  if (!normalizeRoleAllowed(role)) {
    return {
      ok: false,
      message: 'Only organization owners and admins can manage connected agents.',
      code: 'FORBIDDEN',
    };
  }

  const { data: statusRows, error: statusError } = await supabase
    .from('agent_statuses')
    .select('id, name')
    .in('name', ['active', 'inactive'])
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (statusError) return { ok: false, message: statusError.message };

  const statusOptions: ConnectedAgentStatusOption[] = (statusRows ?? []).map(
    (row: StatusRow) => ({
      id: row.id,
      name: row.name,
      label: row.name.charAt(0).toUpperCase() + row.name.slice(1),
    }),
  );

  const { data: planRow, error: planError } = planId
    ? await supabase
        .from('plans')
        .select('max_model_tier_index, default_model_id')
        .eq('id', planId)
        .maybeSingle()
    : { data: null, error: null };

  if (planError) return { ok: false, message: planError.message };

  const plan = planRow as PlanRow | null;
  const maxModelTierIndex =
    plan?.max_model_tier_index != null ? Number(plan.max_model_tier_index) : 0;

  let planDefaultModelDisplayName: string | null = null;
  const defaultModelId = String(plan?.default_model_id ?? '').trim();
  if (defaultModelId) {
    const { data: defaultModelRow, error: defaultModelError } = await supabase
      .from('models')
      .select('display_name')
      .eq('id', defaultModelId)
      .eq('is_active', true)
      .maybeSingle();
    if (defaultModelError) return { ok: false, message: defaultModelError.message };
    const dn = String((defaultModelRow as DefaultModelNameRow | null)?.display_name ?? '').trim();
    planDefaultModelDisplayName = dn || null;
  }

  const { data: tierRows, error: tierError } = await supabase
    .from('model_tiers')
    .select('id, min_plan_index')
    .eq('is_active', true);

  if (tierError) return { ok: false, message: tierError.message };

  const allowedTierIds = (tierRows ?? [])
    .filter((row: ModelTierRow) => Number(row.min_plan_index) <= maxModelTierIndex)
    .map((row: ModelTierRow) => row.id);

  let modelOptions: ConnectedAgentModelOption[] = [];
  if (allowedTierIds.length > 0) {
    const { data: modelRows, error: modelError } = await supabase
      .from('models')
      .select('id, name, display_name, model_tier_id')
      .in('model_tier_id', allowedTierIds)
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    if (modelError) return { ok: false, message: modelError.message };
    modelOptions = (modelRows ?? []).map((row: ModelRow) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
    }));
    if (defaultModelId) {
      modelOptions = modelOptions.filter((m) => m.id !== defaultModelId);
    }
  }

  const [{ data: urlRow, error: urlError }, { data: apiKeyRow, error: apiKeyError }] = await Promise.all([
    supabase
      .from('urls')
      .select('id,url_key,url_value')
      .eq('url_key', 'rag_agent_widget_script_src')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('project_api_keys')
      .select('key_prefix')
      .eq('project_id', pid)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (urlError) return { ok: false, message: urlError.message };
  if (apiKeyError) return { ok: false, message: apiKeyError.message };

  const { data: projectAgentRows, error: projectAgentsError } = await supabase
    .from('project_agents')
    .select(
      `
      id,
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
    .eq('project_id', pid)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (projectAgentsError) return { ok: false, message: projectAgentsError.message };

  const agents: ConnectedAgentItem[] = (projectAgentRows ?? []).map((row: ProjectAgentRow) => {
    const agent = firstEmbed(row.agents);
    const type = firstEmbed(agent?.agent_types ?? null);
    const status = firstEmbed(row.agent_statuses);
    const widgetConfig = firstEmbed(row.project_agent_widget_configs);
    const iconConfig = normalizeWidgetLauncherIconConfig({
      mode: widgetConfig?.icon_mode ?? null,
      lucideIcon: widgetConfig?.lucide_icon ?? null,
      customIconUrl: widgetConfig?.custom_icon_url ?? null,
    });
    const requiredContactFields = normalizeWidgetRequiredContactFields(
      widgetConfig?.required_contact_fields ?? null,
    );
    return {
      projectAgentId: row.id,
      agentId: row.agent_id,
      customAgentName: row.custom_agent_name,
      name: agent?.name ?? '—',
      displayName: agent?.display_name ?? '—',
      description: agent?.description ?? null,
      version: agent?.version ?? '1.0.0',
      typeDisplayName: type?.display_name?.trim() || '—',
      systemInstruction: agent?.system_instruction ?? '',
      updatedAt: row.updated_at,
      statusId: row.status_id,
      statusName: status?.name?.trim() || 'unknown',
      userInstruction: row.user_instruction,
      greeting: row.greeting,
      modelId: row.model_id,
      config: row.config,
      configSchema: agent?.config_schema ?? null,
      widgetLauncherIconMode: iconConfig.mode,
      widgetLauncherIconLucide: iconConfig.lucideIcon,
      widgetLauncherIconCustomUrl: iconConfig.customIconUrl,
      widgetThemeColor: normalizeWidgetThemeColor(widgetConfig?.widget_theme_color ?? null),
      widgetRequiredContactFields: requiredContactFields,
    };
  });

  return {
    ok: true,
    projectName: project.title,
    widgetScriptSrc: (urlRow as UrlRow | null)?.url_value ?? null,
    activeApiKeyPrefix: (apiKeyRow as ApiKeyPrefixRow | null)?.key_prefix ?? null,
    planDefaultModelId: defaultModelId || null,
    planDefaultModelDisplayName,
    agents,
    statusOptions,
    modelOptions,
  };
}
