/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  CreateOrganizationProjectApiResult,
  CreateOrganizationProjectPayload,
  OrganizationProjectsApiResult,
} from '@/lib/organizations/organization-types';

export async function fetchOrganizationProjectsViaApi(
  organizationId: string,
): Promise<OrganizationProjectsApiResult> {
  return apiFetch<OrganizationProjectsApiResult>(
    `/api/organizations/${encodeURIComponent(organizationId)}/projects`,
    {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    },
  );
}

export async function createOrganizationProjectViaApi(
  organizationId: string,
  payload: CreateOrganizationProjectPayload,
): Promise<CreateOrganizationProjectApiResult> {
  return apiFetch<CreateOrganizationProjectApiResult>(
    `/api/organizations/${encodeURIComponent(organizationId)}/projects`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}
