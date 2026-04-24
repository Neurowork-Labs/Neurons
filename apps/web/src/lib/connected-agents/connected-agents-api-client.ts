/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  ConnectedAgentsListApiResult,
  UpdateConnectedAgentApiResult,
} from '@/lib/connected-agents/connected-agents-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchConnectedAgentsViaApi(
  projectId: string,
): Promise<ConnectedAgentsListApiResult> {
  return apiFetch<ConnectedAgentsListApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/connected-agents`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export type WidgetIconUploadApiResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string; code?: string };

export type WidgetPreviewSessionApiResult =
  | {
      ok: true;
      previewToken: string;
      previewTokenExpiresAtUnix: number;
      widgetScriptSrc: string;
      projectAgentId: string;
      projectName: string;
      agentName: string;
      defaultGreetings: string | null;
      widgetThemeColor: string;
      projectWebsiteUrl: string | null;
    }
  | { ok: false; message: string; code?: string };

export async function uploadWidgetIconViaApi(
  projectId: string,
  projectAgentId: string,
  file: File,
): Promise<WidgetIconUploadApiResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/connected-agents/${encodeURIComponent(projectAgentId)}/widget-icon-upload`,
    { method: 'POST', body: formData, cache: 'no-store' },
  );
  return (await res.json()) as WidgetIconUploadApiResult;
}

export async function createWidgetPreviewSessionViaApi(
  projectId: string,
  projectAgentId: string,
): Promise<WidgetPreviewSessionApiResult> {
  return apiFetch<WidgetPreviewSessionApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/connected-agents/${encodeURIComponent(projectAgentId)}/widget-preview-session`,
    {
      method: 'POST',
      headers: jsonHeaders,
      cache: 'no-store',
    },
  );
}

export async function updateConnectedAgentViaApi(
  projectId: string,
  projectAgentId: string,
  payload: {
    statusId: string;
    modelId: string | null;
    userInstruction: string | null;
    greeting: string | null;
    customAgentName: string | null;
    config: unknown | null;
    widgetLauncherIcon: {
      mode?: unknown;
      lucideIcon?: unknown;
      customIconUrl?: unknown;
    } | null;
    widgetThemeColor: unknown;
    requiredContactFields: unknown;
  },
): Promise<UpdateConnectedAgentApiResult> {
  return apiFetch<UpdateConnectedAgentApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/connected-agents/${encodeURIComponent(projectAgentId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}
