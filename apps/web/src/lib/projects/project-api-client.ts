/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type { ProjectContextApiResult } from '@/lib/projects/project-types';

export async function fetchProjectContextViaApi(
  projectId: string,
): Promise<ProjectContextApiResult> {
  return apiFetch<ProjectContextApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    },
  );
}
