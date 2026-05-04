/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export type GlobalSearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type GlobalSearchPayload = {
  organizations: GlobalSearchItem[];
  projects: GlobalSearchItem[];
  storageFiles: GlobalSearchItem[];
  connectedAgents: GlobalSearchItem[];
  cloudAgents: GlobalSearchItem[];
  apiKeys: GlobalSearchItem[];
};

export type GlobalSearchApiResult =
  | { ok: true; query: string; results: GlobalSearchPayload }
  | { ok: false; message: string; code?: 'BAD_REQUEST' | 'UNAUTHORIZED' };
