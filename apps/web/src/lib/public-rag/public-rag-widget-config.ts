/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { normalizeWidgetLauncherIconConfig } from '@/lib/connected-agents/widget-launcher-icon-config';
import { normalizeWidgetRequiredContactFields } from '@/lib/connected-agents/widget-contact-fields-config';
import { ensureWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type PublicRagWidgetConfigResult =
  | {
      ok: true;
      launcherIcon: {
        mode: 'lucide' | 'custom_url';
        lucideIcon: string;
        customIconUrl: string | null;
      };
      requiredContactFields: Array<'name' | 'email' | 'phone' | 'location'>;
      greeting: string | null;
      widgetThemeColor: string;
      agentName: string;
    }
  | { ok: false; message: string; code?: 'BAD_REQUEST' };

function firstEmbed<T>(embed: T | T[] | null): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export async function getPublicRagWidgetConfig(
  ctx: { projectId: string },
  body: { projectAgentId: string },
): Promise<PublicRagWidgetConfigResult> {
  const projectAgentId = String(body.projectAgentId ?? '').trim();
  if (!projectAgentId) {
    return { ok: false, message: 'Missing required fields.', code: 'BAD_REQUEST' };
  }

  const supabase = getSupabaseServiceRoleClient();

  const { data: pa, error: paErr } = await supabase
    .from('project_agents')
    .select(
      `
      id,
      greeting,
      custom_agent_name,
      agents!project_agents_agent_id_fkey (
        display_name
      )
    `,
    )
    .eq('id', projectAgentId)
    .eq('project_id', ctx.projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (paErr) return { ok: false, message: paErr.message };
  if (!pa) {
    return { ok: false, message: 'Invalid project agent.', code: 'BAD_REQUEST' };
  }
  const agentEmbed = firstEmbed(
    (pa as { agents?: { display_name: string | null } | { display_name: string | null }[] | null })
      .agents ?? null,
  );
  const agentName =
    String((pa as { custom_agent_name?: string | null }).custom_agent_name ?? '').trim() ||
    String(agentEmbed?.display_name ?? '').trim() ||
    'Agent';

  const { data: row, error: rowErr } = await supabase
    .from('project_agent_widget_configs')
    .select('icon_mode, lucide_icon, custom_icon_url, required_contact_fields, widget_theme_color')
    .eq('project_agent_id', projectAgentId)
    .maybeSingle();
  if (rowErr) return { ok: false, message: rowErr.message };

  const icon = normalizeWidgetLauncherIconConfig({
    mode: row?.icon_mode ?? null,
    lucideIcon: row?.lucide_icon ?? null,
    customIconUrl: row?.custom_icon_url ?? null,
  });
  const requiredContactFields = normalizeWidgetRequiredContactFields(
    row?.required_contact_fields ?? null,
  );

  return {
    ok: true,
    launcherIcon: {
      mode: icon.mode,
      lucideIcon: icon.lucideIcon,
      customIconUrl: icon.customIconUrl,
    },
    requiredContactFields,
    greeting: String((pa as { greeting?: string | null }).greeting ?? '').trim() || null,
    widgetThemeColor: ensureWidgetThemeColor(row?.widget_theme_color ?? null),
    agentName,
  };
}
