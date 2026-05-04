/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  ProjectApiKeyCreateApiResult,
  ProjectApiKeysListApiResult,
} from '@/lib/project-api-keys/project-api-keys-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectApiKeysViaApi(
  projectId: string,
  query: { page?: number; pageSize?: number; search?: string },
): Promise<ProjectApiKeysListApiResult> {
  const params = new URLSearchParams();
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query.search != null && query.search.trim() !== '') {
    params.set('search', query.search.trim());
  }
  const qs = params.toString();
  const url = `/api/projects/${encodeURIComponent(projectId)}/api-keys${qs ? `?${qs}` : ''}`;
  return apiFetch<ProjectApiKeysListApiResult>(url, {
    method: 'GET',
    headers: jsonHeaders,
    cache: 'no-store',
  });
}

export async function createProjectApiKeyViaApi(
  projectId: string,
  payload: {
    name: string;
    expiresAt: string | null;
    confirmDeactivateOtherActiveKeys?: boolean;
  },
): Promise<ProjectApiKeyCreateApiResult> {
  return apiFetch<ProjectApiKeyCreateApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/api-keys`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}
