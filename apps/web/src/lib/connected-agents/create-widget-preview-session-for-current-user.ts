/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { issuePublicRagPreviewToken } from '@/lib/public-rag/public-rag-preview-token';
import { ensureWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';
import { projectDomainToOpenUrl } from '@/lib/projects/project-domain-url';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ProjectRow = {
  id: string;
  title: string;
  organization_id: string;
  domain: string | null;
  is_domain_verified: boolean;
};

type MemberRow = {
  role: string;
};

type ProjectAgentRow = {
  id: string;
  custom_agent_name: string | null;
  greeting: string | null;
  project_agent_widget_configs:
    | {
        widget_theme_color: string | null;
      }
    | Array<{
        widget_theme_color: string | null;
      }>
    | null;
  agents:
    | {
        display_name: string | null;
      }
    | Array<{
        display_name: string | null;
      }>
    | null;
};

type ScriptRow = {
  url_value: string;
};

function normalizeRoleAllowed(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function firstEmbed<T>(embed: T | T[] | null): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export type CreateWidgetPreviewSessionResult =
  | {
      ok: true;
      previewToken: string;
      previewTokenExpiresAtUnix: number;
      widgetScriptSrc: string;
      projectAgentId: string;
      projectName: string;
      agentName: string;
      defaultGreetings: string | null;
      widgetThemeColor: string;
      projectWebsiteUrl: string | null;
    }
  | { ok: false; message: string; code?: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' };

export async function createWidgetPreviewSessionForCurrentUser(input: {
  projectId: string;
  projectAgentId: string;
}): Promise<CreateWidgetPreviewSessionResult> {
  const projectId = String(input.projectId ?? '').trim();
  const projectAgentId = String(input.projectAgentId ?? '').trim();
  if (!projectId || !projectAgentId) {
    return { ok: false, message: 'Missing project id or project agent id.', code: 'BAD_REQUEST' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id,title,organization_id,domain,is_domain_verified')
    .eq('id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (projectError) return { ok: false, message: projectError.message };
  if (!projectRow) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const project = projectRow as ProjectRow;
  const projectWebsiteUrl =
    project.is_domain_verified && String(project.domain ?? '').trim()
      ? projectDomainToOpenUrl(String(project.domain ?? ''))
      : null;
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
      message: 'Only organization owners and admins can preview connected agents.',
      code: 'FORBIDDEN',
    };
  }

  const { data: paRow, error: paError } = await supabase
    .from('project_agents')
    .select(
      `
      id,
      custom_agent_name,
      greeting,
      project_agent_widget_configs (
        widget_theme_color
      ),
      agents!project_agents_agent_id_fkey (
        display_name
      )
    `,
    )
    .eq('id', projectAgentId)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (paError) return { ok: false, message: paError.message };
  if (!paRow) return { ok: false, message: 'Connected agent not found.', code: 'NOT_FOUND' };

  const pa = paRow as ProjectAgentRow;
  const agentEmbed = firstEmbed(pa.agents);
  const widgetConfig = firstEmbed(pa.project_agent_widget_configs);
  const agentName = String(pa.custom_agent_name ?? '').trim() || String(agentEmbed?.display_name ?? '').trim() || 'Agent';

  const { data: scriptRow, error: scriptError } = await supabase
    .from('urls')
    .select('url_value')
    .eq('url_key', 'rag_agent_widget_script_src')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (scriptError) return { ok: false, message: scriptError.message };
  const widgetScriptSrc = String((scriptRow as ScriptRow | null)?.url_value ?? '').trim();
  if (!widgetScriptSrc) {
    return {
      ok: false,
      message: 'Widget script source URL is not configured.',
      code: 'BAD_REQUEST',
    };
  }

  const tokenResult = issuePublicRagPreviewToken({
    projectId,
    organizationId: project.organization_id,
    projectAgentId,
    userId: authData.user.id,
  });
  if (!tokenResult.ok) {
    return { ok: false, message: tokenResult.message, code: 'BAD_REQUEST' };
  }

  return {
    ok: true,
    previewToken: tokenResult.token,
    previewTokenExpiresAtUnix: tokenResult.expiresAtUnix,
    widgetScriptSrc,
    projectAgentId,
    projectName: String(project.title ?? '').trim(),
    agentName,
    defaultGreetings: String(pa.greeting ?? '').trim() || null,
    widgetThemeColor: ensureWidgetThemeColor(widgetConfig?.widget_theme_color),
    projectWebsiteUrl,
  };
}
