/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type { ActivePlansApiResult } from '@/lib/plans/plan-types';

export type { ActivePlansApiResult, ActivePlanOption } from '@/lib/plans/plan-types';

export async function fetchActivePlansViaApi(): Promise<ActivePlansApiResult> {
  return apiFetch<ActivePlansApiResult>('/api/plans', {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
  });
}
