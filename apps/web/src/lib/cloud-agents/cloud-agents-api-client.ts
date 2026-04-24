/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type { CloudAgentsCatalogApiResult } from '@/lib/cloud-agents/cloud-agents-types';

export async function fetchCloudAgentsCatalogViaApi(): Promise<CloudAgentsCatalogApiResult> {
  return apiFetch<CloudAgentsCatalogApiResult>('/api/cloud-agents', {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
  });
}
