/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';

export type MeApiResult =
  | { ok: true; email: string; planName: string | null }
  | { ok: false; message: string };

export async function getMeViaApi(): Promise<MeApiResult> {
  return apiFetch<MeApiResult>('/api/me', {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
}
