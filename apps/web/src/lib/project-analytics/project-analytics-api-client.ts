import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  ProjectAnalyticsFiltersApiResult,
  ProjectAnalyticsVisitorConversationApiResult,
  ProjectAnalyticsVisitorsApiResult,
} from '@/lib/project-analytics/project-analytics-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectAnalyticsFiltersViaApi(
  projectId: string,
): Promise<ProjectAnalyticsFiltersApiResult> {
  return apiFetch<ProjectAnalyticsFiltersApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/analytics`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function fetchProjectAnalyticsVisitorsViaApi(
  projectId: string,
  projectAgentId: string,
): Promise<ProjectAnalyticsVisitorsApiResult> {
  const q = new URLSearchParams({ projectAgentId });
  return apiFetch<ProjectAnalyticsVisitorsApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/analytics/visitors?${q.toString()}`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function fetchProjectAnalyticsVisitorConversationViaApi(
  projectId: string,
  projectAgentId: string,
  visitorContactId: string,
): Promise<ProjectAnalyticsVisitorConversationApiResult> {
  const q = new URLSearchParams({ projectAgentId, visitorContactId });
  return apiFetch<ProjectAnalyticsVisitorConversationApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/analytics/visitor-conversation?${q.toString()}`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}
