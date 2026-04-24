/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Counts rows in `agent_executions` whose `project_agent_id` belongs to this project
 * (`project_agents.project_id`), per schema in docs/db-schema/sql-queries.md.
 * Returns 0 on error so the project overview still loads.
 */
export async function countAgentExecutionsForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { data: paRows, error: paError } = await supabase
    .from('project_agents')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (paError || !paRows?.length) {
    return 0;
  }

  const ids = paRows.map((r: { id: string }) => r.id);
  const chunkSize = 100;
  let total = 0;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { count, error } = await supabase
      .from('agent_executions')
      .select('*', { count: 'exact', head: true })
      .in('project_agent_id', chunk);

    if (error) {
      return 0;
    }
    total += count ?? 0;
  }

  return total;
}
