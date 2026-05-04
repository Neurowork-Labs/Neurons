/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type { GlobalSearchApiResult } from '@/lib/global-search/global-search-types';

export async function searchGlobalViaApi(query: string): Promise<GlobalSearchApiResult> {
  const params = new URLSearchParams();
  params.set('q', query);
  const url = `/api/search/global?${params.toString()}`;
  return apiFetch<GlobalSearchApiResult>(url, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
  });
}
