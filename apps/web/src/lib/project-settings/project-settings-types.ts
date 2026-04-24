/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export type ProjectSettingsPayload = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  domain: string | null;
  statusName: string;
  isDomainVerified: boolean;
  domainVerifiedAt: string | null;
  canManage: boolean;
};

export type ProjectSettingsGetApiResult =
  | { ok: true; settings: ProjectSettingsPayload }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export type ProjectSettingsPatchApiResult =
  | { ok: true; settings: ProjectSettingsPayload }
  | {
      ok: false;
      message: string;
      code?: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND';
    };

export type ProjectSoftDeleteApiResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      code?: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'TITLE_MISMATCH';
    };
