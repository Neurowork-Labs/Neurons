/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export const ALL_AGENT_STATUSES_FILTER_VALUE = '__all__';

export type ConnectedAgentStatusOption = {
  id: string;
  name: string;
  label: string;
};

export type ConnectedAgentModelOption = {
  id: string;
  name: string;
  displayName: string;
};

export type ConnectedAgentItem = {
  projectAgentId: string;
  agentId: string;
  customAgentName: string | null;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  typeDisplayName: string;
  systemInstruction: string;
  updatedAt: string | null;
  statusId: string;
  statusName: string;
  userInstruction: string | null;
  greeting: string | null;
  modelId: string | null;
  config: unknown | null;
  configSchema: unknown | null;
  widgetLauncherIconMode: 'lucide' | 'custom_url';
  widgetLauncherIconLucide: string;
  widgetLauncherIconCustomUrl: string | null;
  widgetThemeColor: string | null;
  widgetRequiredContactFields: Array<'name' | 'email' | 'phone' | 'location'>;
};

export type ConnectedAgentsListApiResult =
  | {
      ok: true;
      projectName: string;
      widgetScriptSrc: string | null;
      activeApiKeyPrefix: string | null;
      /** Org plan `public.plans.default_model_id` (for deduping model list + normalizing draft). */
      planDefaultModelId: string | null;
      /** Resolved from org plan `public.plans.default_model_id` → `public.models.display_name`. */
      planDefaultModelDisplayName: string | null;
      agents: ConnectedAgentItem[];
      statusOptions: ConnectedAgentStatusOption[];
      modelOptions: ConnectedAgentModelOption[];
    }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export type UpdateConnectedAgentApiResult =
  | {
      ok: true;
      agent: ConnectedAgentItem;
    }
  | {
      ok: false;
      message: string;
      code?: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND';
    };
