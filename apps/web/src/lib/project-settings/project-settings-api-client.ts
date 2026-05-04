/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */
'use client';

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  ProjectSettingsGetApiResult,
  ProjectSettingsPatchApiResult,
  ProjectSoftDeleteApiResult,
} from '@/lib/project-settings/project-settings-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectSettingsViaApi(
  projectId: string,
): Promise<ProjectSettingsGetApiResult> {
  return apiFetch<ProjectSettingsGetApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/settings`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function patchProjectSettingsViaApi(
  projectId: string,
  payload: { title: string; description: string | null },
): Promise<ProjectSettingsPatchApiResult> {
  return apiFetch<ProjectSettingsPatchApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/settings`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function softDeleteProjectViaApi(
  projectId: string,
  confirmProjectTitle: string,
): Promise<ProjectSoftDeleteApiResult> {
  return apiFetch<ProjectSoftDeleteApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/settings/delete`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ confirmProjectTitle }),
      cache: 'no-store',
    },
  );
}
