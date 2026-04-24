/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { ProjectConnectedAgentsApiResult } from '@/lib/projects/project-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ProjectRow = {
  id: string;
  title: string;
  organization_id: string;
};

type ProjectAgentRow = {
  agent_id: string;
};

export async function listProjectConnectedAgentsForCurrentUser(
  projectId: string,
): Promise<ProjectConnectedAgentsApiResult> {
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
    .select('id, title, organization_id')
    .eq('id', pid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) return { ok: false, message: projectError.message };
  if (!projectRow) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const project = projectRow as ProjectRow;

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('id')
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

  const { data: linkRows, error: linkError } = await supabase
    .from('project_agents')
    .select('agent_id')
    .eq('project_id', pid)
    .eq('is_deleted', false);

  if (linkError) return { ok: false, message: linkError.message };

  return {
    ok: true,
    projectName: project.title,
    connectedAgentIds: (linkRows ?? []).map((r: ProjectAgentRow) => r.agent_id),
  };
}
