/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { DisconnectProjectAgentApiResult } from '@/lib/projects/project-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ProjectRow = {
  id: string;
  organization_id: string;
};

type LinkRow = {
  id: string;
};

export async function disconnectProjectAgentForCurrentUser(
  projectId: string,
  agentId: string,
): Promise<DisconnectProjectAgentApiResult> {
  const pid = projectId?.trim();
  const aid = agentId?.trim();
  if (!pid || !aid) {
    return { ok: false, message: 'Missing project or agent id.', code: 'BAD_REQUEST' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', pid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) return { ok: false, message: projectError.message };
  if (!projectRow) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const project = projectRow as ProjectRow;

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

  const role = String(memberRow.role ?? '');
  if (role !== 'owner' && role !== 'admin') {
    return {
      ok: false,
      message: 'Only organization owners and admins can disconnect agents.',
      code: 'FORBIDDEN',
    };
  }

  const { data: linkRow, error: linkError } = await supabase
    .from('project_agents')
    .select('id')
    .eq('project_id', pid)
    .eq('agent_id', aid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (linkError) return { ok: false, message: linkError.message };
  if (!linkRow) {
    return {
      ok: false,
      message: 'This agent is not connected to the project.',
      code: 'NOT_CONNECTED',
    };
  }

  const link = linkRow as LinkRow;
  const { data: updated, error: updateError } = await supabase
    .from('project_agents')
    .update({ is_deleted: true })
    .eq('id', link.id)
    .select('id')
    .single();

  if (updateError) return { ok: false, message: updateError.message };
  if (!updated?.id) return { ok: false, message: 'Could not disconnect agent.' };

  return { ok: true, projectAgentId: updated.id };
}
