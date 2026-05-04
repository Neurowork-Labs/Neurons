/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/** Select value meaning “no agent type filter”. */
export const ALL_AGENT_TYPES_FILTER_VALUE = '__all__';
/** Select value meaning “no connection-state filter”. */
export const ALL_CONNECTION_STATES_FILTER_VALUE = '__all__';
export const CONNECTED_ONLY_FILTER_VALUE = 'connected';
export const NOT_CONNECTED_ONLY_FILTER_VALUE = 'not_connected';

export type CloudAgentTypeOption = {
  id: string;
  name: string;
  displayName: string;
};

export type CloudAgentCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  iconUrl: string | null;
  version: string;
  typeId: string;
  typeName: string;
  typeDisplayName: string;
  typeDescription: string | null;
  statusName: string;
  defaultModelName: string;
  defaultModelDisplayName: string;
  systemInstruction: string;
  configSchema: unknown | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CloudAgentsCatalogApiResult =
  | {
      ok: true;
      agents: CloudAgentCatalogItem[];
      agentTypes: CloudAgentTypeOption[];
    }
  | { ok: false; message: string };
