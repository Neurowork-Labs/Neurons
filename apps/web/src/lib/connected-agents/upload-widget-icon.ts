/*
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { validateWidgetIconFile } from '@/lib/connected-agents/widget-launcher-icon-config';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const WIDGET_ASSETS_BUCKET = 'widget-assets';

export type WidgetIconUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string; code?: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' };

function sanitizeSvg(raw: string): string {
  let cleaned = raw;
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  cleaned = cleaned.replace(/<script[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  cleaned = cleaned.replace(/javascript\s*:/gi, 'blocked:');
  cleaned = cleaned.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  cleaned = cleaned.replace(/<foreignObject[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, '');
  cleaned = cleaned.replace(/<iframe[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/<embed[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/<object[\s\S]*?<\/object\s*>/gi, '');
  cleaned = cleaned.replace(/<object[\s\S]*?\/>/gi, '');
  return cleaned;
}

export async function uploadWidgetIconForCurrentUser(
  projectId: string,
  projectAgentId: string,
  file: File,
): Promise<WidgetIconUploadResult> {
  const fileValidation = validateWidgetIconFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (!fileValidation.ok) {
    return { ok: false, message: fileValidation.message, code: 'BAD_REQUEST' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: paRow, error: paErr } = await supabase
    .from('project_agents')
    .select(
      `id, projects!project_agents_project_id_fkey ( id, organization_id )`,
    )
    .eq('id', projectAgentId)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (paErr) return { ok: false, message: paErr.message };
  if (!paRow) return { ok: false, message: 'Connected agent not found.', code: 'NOT_FOUND' };

  const project = Array.isArray(paRow.projects) ? paRow.projects[0] : paRow.projects;
  if (!project) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };
  const orgId = (project as { organization_id: string }).organization_id;

  const { data: memberRow, error: memberErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', authData.user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (memberErr) return { ok: false, message: memberErr.message };
  const role = String(memberRow?.role ?? '');
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, message: 'Only organization admins can upload widget icons.', code: 'FORBIDDEN' };
  }

  const ext = String(file.name).split('.').pop()?.toLowerCase()?.trim() ?? 'svg';
  const isSvg = ext === 'svg' || file.type === 'image/svg+xml';

  let uploadBytes: Buffer | Uint8Array;
  let contentType = file.type || 'application/octet-stream';

  if (isSvg) {
    const rawText = await file.text();
    const sanitized = sanitizeSvg(rawText);
    uploadBytes = Buffer.from(sanitized, 'utf-8');
    contentType = 'image/svg+xml';
  } else {
    uploadBytes = Buffer.from(await file.arrayBuffer());
  }

  const storagePath = `${orgId}/${projectId}/${projectAgentId}/launcher-icon.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(WIDGET_ASSETS_BUCKET)
    .upload(storagePath, uploadBytes, {
      contentType,
      upsert: true,
    });
  if (uploadErr) return { ok: false, message: uploadErr.message };

  const { data: urlData } = supabase.storage
    .from(WIDGET_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    return { ok: false, message: 'Failed to generate public URL for uploaded icon.' };
  }

  const timestampedUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: upsertErr } = await supabase
    .from('project_agent_widget_configs')
    .upsert(
      {
        project_agent_id: projectAgentId,
        icon_mode: 'custom_url',
        lucide_icon: 'user-round',
        custom_icon_url: timestampedUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_agent_id' },
    );
  if (upsertErr) return { ok: false, message: upsertErr.message };

  return { ok: true, publicUrl: timestampedUrl };
}
