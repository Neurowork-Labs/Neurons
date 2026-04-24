import type { ProjectAnalyticsFiltersApiResult } from '@/lib/project-analytics/project-analytics-types';
import { listProjectConnectedAgentsCatalogForCurrentUser } from '@/lib/projects/list-project-connected-agents-catalog';

export async function listProjectAnalyticsFiltersForCurrentUser(
  projectId: string,
): Promise<ProjectAnalyticsFiltersApiResult> {
  const result = await listProjectConnectedAgentsCatalogForCurrentUser(projectId);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    connectedAgents: result.agents
      .filter((agent) => agent.statusName === 'active')
      .map((agent) => ({
        projectAgentId: agent.projectAgentId,
        displayName: agent.displayName,
      })),
  };
}
