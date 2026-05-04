/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Counts active `project_agents` rows for a project.
 * Returns 0 if the query fails (e.g. RLS or missing table) so project overview still loads.
 */
export async function countAgentsConnectedToProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('project_agents')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (error) {
    return 0;
  }

  return typeof count === 'number' ? count : 0;
}
