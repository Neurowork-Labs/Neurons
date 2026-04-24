/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { OrganizationProjectListItem } from '@/lib/organizations/organization-types';

export type ProjectContextPayload = {
  organization: { id: string; name: string; slug: string };
  limits: { planName: string };
  project: OrganizationProjectListItem;
  /** Active rows in `project_agents` for this project. */
  agentsConnectedCount: number;
  /** Count of `agent_executions` for this project's `project_agents`. */
  totalExecutionsCount: number;
  /** `support_types.name` for the organization's current `plans` row. */
  planSupportTypeLabel: string;
};

export type ProjectContextApiResult =
  | { ok: true } & ProjectContextPayload
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export type ConnectPublicAgentApiResult =
  | { ok: true; projectAgentId: string }
  | {
      ok: false;
      message: string;
      code?:
        | 'BAD_REQUEST'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'ALREADY_CONNECTED'
        | 'AGENT_NOT_AVAILABLE';
    };

export type ProjectConnectedAgentsApiResult =
  | {
      ok: true;
      projectName: string;
      connectedAgentIds: string[];
    }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' };

export type DisconnectProjectAgentApiResult =
  | { ok: true; projectAgentId: string }
  | {
      ok: false;
      message: string;
      code?: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONNECTED';
    };
