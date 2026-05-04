/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  ConnectPublicAgentApiResult,
  DisconnectProjectAgentApiResult,
  ProjectConnectedAgentsApiResult,
} from '@/lib/projects/project-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectConnectedAgentsViaApi(
  projectId: string,
): Promise<ProjectConnectedAgentsApiResult> {
  return apiFetch<ProjectConnectedAgentsApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/agents`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function connectPublicAgentToProjectViaApi(
  projectId: string,
  agentId: string,
): Promise<ConnectPublicAgentApiResult> {
  return apiFetch<ConnectPublicAgentApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/agents`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ agentId }),
      cache: 'no-store',
    },
  );
}

export async function disconnectProjectAgentViaApi(
  projectId: string,
  agentId: string,
): Promise<DisconnectProjectAgentApiResult> {
  return apiFetch<DisconnectProjectAgentApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/agents`,
    {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ agentId }),
      cache: 'no-store',
    },
  );
}
