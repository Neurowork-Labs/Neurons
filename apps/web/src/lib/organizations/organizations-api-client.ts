/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  CreateOrganizationApiResult,
  CreateOrganizationPayload,
  OrganizationsApiResult,
} from '@/lib/organizations/organization-types';

export type {
  CreateOrganizationApiResult,
  CreateOrganizationPayload,
  OrganizationListItem,
  OrganizationsApiResult,
} from '@/lib/organizations/organization-types';

export async function fetchOrganizationsViaApi(): Promise<OrganizationsApiResult> {
  return apiFetch<OrganizationsApiResult>('/api/organizations', {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
  });
}

export async function createOrganizationViaApi(
  payload: CreateOrganizationPayload,
): Promise<CreateOrganizationApiResult> {
  return apiFetch<CreateOrganizationApiResult>('/api/organizations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
