/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export type OrganizationListItem = {
  id: string;
  name: string;
  slug: string;
  planName: string;
  /** From `organization_statuses.name` (e.g. active, paused). */
  statusName: string;
  projectCount: number;
};

export type OrganizationsApiResult =
  | { ok: true; organizations: OrganizationListItem[] }
  | { ok: false; message: string };

export type CreateOrganizationPayload = {
  name: string;
  slug?: string;
  /** Selected `public.plans.id` (organization-level plan; subscriptions reference org + plan). */
  planId: string;
  /**
   * When true, any other active free-tier orgs you own are set to Paused before creating this one.
   */
  confirmPausePreviousFreeOrganizations?: boolean;
};

export type CreateOrganizationApiResult =
  | { ok: true; message: string; organization: OrganizationListItem }
  | {
      ok: false;
      message: string;
      code?: 'FREE_ORG_LIMIT';
      previousOrganizationNames?: string[];
    };

export type OrganizationProjectListItem = {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  isDomainVerified: boolean;
  statusName: string;
  createdAt: string;
};

/** From `public.plans` for the organization; `maxProjectsPerOrg` is -1 for unlimited (Enterprise). */
export type OrganizationProjectsLimits = {
  planName: string;
  maxProjectsPerOrg: number;
  projectCount: number;
};

export type OrganizationProjectsApiResult =
  | {
      ok: true;
      organization: { id: string; name: string; slug: string; statusName: string };
      projects: OrganizationProjectListItem[];
      limits: OrganizationProjectsLimits;
    }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export type CreateOrganizationProjectPayload = {
  title: string;
  domain?: string;
  description?: string;
};

export type CreateOrganizationProjectApiResult =
  | { ok: true; message: string; project: OrganizationProjectListItem }
  | {
      ok: false;
      message: string;
      code?:
        | 'PROJECT_LIMIT'
        | 'FORBIDDEN'
        | 'ORG_INACTIVE'
        | 'DUPLICATE_DOMAIN'
        | 'DUPLICATE_PROJECT'
        | 'DOMAIN_REQUIRED'
        | 'INVALID_DOMAIN';
    };
