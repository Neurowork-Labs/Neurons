/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export type ProjectApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ProjectApiKeysListApiResult =
  | {
      ok: true;
      canManage: boolean;
      isDomainVerified: boolean;
      keys: ProjectApiKeyListItem[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; message: string; code?: string };

export type ProjectApiKeyCreateApiResult =
  | {
      ok: true;
      /** Shown once in the UI after creation; never stored or returned again. */
      plaintextKey: string;
      key: ProjectApiKeyListItem;
    }
  | {
      ok: false;
      message: string;
      code?: 'ACTIVE_KEY_EXISTS' | 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN';
    };
