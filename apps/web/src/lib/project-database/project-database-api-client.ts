/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  QueryTemplateCardConfig,
  ProjectDatabaseConnectionQueryModeGetApiResult,
  ProjectDatabaseConnectionQueryModeUpdateApiResult,
  ProjectDatabaseConnectionQueryTemplateCreateApiResult,
  ProjectDatabaseConnectionQueryTemplateDeleteApiResult,
  ProjectDatabaseConnectionQueryTemplateUpdateApiResult,
  ProjectDatabaseConnectionQueryTemplatesApiResult,
  ProjectDatabaseConnectionCheckApiResult,
  ProjectDatabaseConnectionCredentialsApiResult,
  ProjectDatabaseConnectionCreateApiResult,
  ProjectDatabaseConnectionDeleteApiResult,
  ProjectDatabaseConnectionStatusApiResult,
  ProjectDatabaseConnectionSyncSchemaApiResult,
  ProjectDatabaseDeleteApiResult,
  ProjectDatabaseLookupsApiResult,
  ProjectDatabaseRenameApiResult,
  ProjectDatabaseSchemasListApiResult,
  ProjectDatabaseUpdateDataFileApiResult,
  ProjectDatabaseUpdateFilesApiResult,
  ProjectDatabaseUploadApiResult,
  ProjectDatabaseUploadCheckApiResult,
} from '@/lib/project-database/project-database-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectDatabaseSchemasViaApi(
  projectId: string,
  query: { page?: number; pageSize?: number; search?: string; fetchAll?: boolean },
): Promise<ProjectDatabaseSchemasListApiResult> {
  const params = new URLSearchParams();
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query.search != null && query.search.trim() !== '') params.set('search', query.search.trim());
  if (query.fetchAll) params.set('all', '1');
  const qs = params.toString();
  const url = `/api/projects/${encodeURIComponent(projectId)}/database/schemas${qs ? `?${qs}` : ''}`;
  return apiFetch<ProjectDatabaseSchemasListApiResult>(url, {
    method: 'GET',
    headers: jsonHeaders,
    cache: 'no-store',
  });
}

export async function fetchProjectDatabaseLookupsViaApi(
  projectId: string,
): Promise<ProjectDatabaseLookupsApiResult> {
  return apiFetch<ProjectDatabaseLookupsApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/lookups`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function uploadProjectDatabaseViaApi(
  projectId: string,
  payload: {
    databaseTypeId: string;
    databaseId: string;
    databaseName: string;
    databaseExportLayoutId: string;
    projectAgentIds: string[];
    schemaFile: File;
    dataFile: File;
  },
): Promise<ProjectDatabaseUploadApiResult> {
  const form = new FormData();
  form.set('databaseTypeId', payload.databaseTypeId);
  form.set('databaseId', payload.databaseId);
  form.set('databaseName', payload.databaseName);
  form.set('databaseExportLayoutId', payload.databaseExportLayoutId);
  for (const id of payload.projectAgentIds) {
    form.append('projectAgentIds', id);
  }
  form.set('schemaFile', payload.schemaFile);
  form.set('dataFile', payload.dataFile);

  return apiFetch<ProjectDatabaseUploadApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/upload`,
    { method: 'POST', body: form, cache: 'no-store' },
  );
}

export async function checkProjectDatabaseUploadViaApi(
  projectId: string,
  payload: { databaseName: string; projectAgentIds: string[] },
): Promise<ProjectDatabaseUploadCheckApiResult> {
  return apiFetch<ProjectDatabaseUploadCheckApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/check-upload`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function renameProjectDatabaseSchemaViaApi(
  projectId: string,
  schemaId: string,
  payload: { databaseName: string },
): Promise<ProjectDatabaseRenameApiResult> {
  return apiFetch<ProjectDatabaseRenameApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/schemas/${encodeURIComponent(schemaId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function updateProjectDatabaseSchemaFilesViaApi(
  projectId: string,
  schemaId: string,
  payload: { schemaFile: File; dataFile: File },
): Promise<ProjectDatabaseUpdateFilesApiResult> {
  const form = new FormData();
  form.set('schemaFile', payload.schemaFile);
  form.set('dataFile', payload.dataFile);
  return apiFetch<ProjectDatabaseUpdateFilesApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/schemas/${encodeURIComponent(schemaId)}/update`,
    { method: 'POST', body: form, cache: 'no-store' },
  );
}

export async function deleteProjectDatabaseSchemaViaApi(
  projectId: string,
  schemaId: string,
): Promise<ProjectDatabaseDeleteApiResult> {
  return apiFetch<ProjectDatabaseDeleteApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/schemas/${encodeURIComponent(schemaId)}`,
    { method: 'DELETE', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function updateProjectDatabaseSchemaDataFileViaApi(
  projectId: string,
  schemaId: string,
  payload: { dataFile: File },
): Promise<ProjectDatabaseUpdateDataFileApiResult> {
  const form = new FormData();
  form.set('dataFile', payload.dataFile);
  return apiFetch<ProjectDatabaseUpdateDataFileApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/schemas/${encodeURIComponent(schemaId)}/update-data`,
    { method: 'POST', body: form, cache: 'no-store' },
  );
}

export async function createProjectDatabaseConnectionViaApi(
  projectId: string,
  payload: {
    databaseTypeId: string;
    databaseId: string;
    displayName: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password: string;
    sslMode: string;
    sslCaPem?: string | null;
    mongoUseSrv?: boolean;
    reconnectWithPassword?: boolean;
    forceMismatch?: boolean;
    projectAgentIds: string[];
  },
): Promise<ProjectDatabaseConnectionCreateApiResult> {
  return apiFetch<ProjectDatabaseConnectionCreateApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function checkProjectDatabaseConnectionViaApi(
  projectId: string,
  payload: { displayName: string; projectAgentIds: string[] },
): Promise<ProjectDatabaseConnectionCheckApiResult> {
  return apiFetch<ProjectDatabaseConnectionCheckApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/check`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function deleteProjectDatabaseConnectionViaApi(
  projectId: string,
  connectionId: string,
): Promise<ProjectDatabaseConnectionDeleteApiResult> {
  return apiFetch<ProjectDatabaseConnectionDeleteApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}`,
    { method: 'DELETE', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function updateProjectDatabaseConnectionStatusViaApi(
  projectId: string,
  connectionId: string,
  action: 'disconnect' | 'reconnect',
): Promise<ProjectDatabaseConnectionStatusApiResult> {
  return apiFetch<ProjectDatabaseConnectionStatusApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ action }),
      cache: 'no-store',
    },
  );
}

export async function fetchProjectDatabaseConnectionCredentialsViaApi(
  projectId: string,
  connectionId: string,
): Promise<ProjectDatabaseConnectionCredentialsApiResult> {
  return apiFetch<ProjectDatabaseConnectionCredentialsApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function updateProjectDatabaseConnectionCredentialsViaApi(
  projectId: string,
  connectionId: string,
  payload: {
    displayName: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password: string;
    sslMode: string;
    sslCaPem?: string | null;
    mongoUseSrv?: boolean;
  },
): Promise<ProjectDatabaseConnectionCredentialsApiResult> {
  return apiFetch<ProjectDatabaseConnectionCredentialsApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function syncProjectDatabaseConnectionSchemaViaApi(
  projectId: string,
  connectionId: string,
): Promise<ProjectDatabaseConnectionSyncSchemaApiResult> {
  return apiFetch<ProjectDatabaseConnectionSyncSchemaApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/sync-schema`,
    {
      method: 'POST',
      headers: jsonHeaders,
      cache: 'no-store',
      body: JSON.stringify({}),
    },
  );
}

export async function fetchProjectDatabaseConnectionQueryTemplatesViaApi(
  projectId: string,
  connectionId: string,
  options?: { search?: string; statusFilter?: 'all' | 'active' | 'inactive' },
): Promise<ProjectDatabaseConnectionQueryTemplatesApiResult> {
  const sp = new URLSearchParams();
  const q = String(options?.search ?? '').trim();
  if (q) sp.set('q', q);
  const st = options?.statusFilter ?? 'all';
  if (st !== 'all') sp.set('status', st);
  const qs = sp.toString();
  const suffix = qs ? `?${qs}` : '';
  return apiFetch<ProjectDatabaseConnectionQueryTemplatesApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-templates${suffix}`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function fetchProjectDatabaseConnectionQueryModeViaApi(
  projectId: string,
  connectionId: string,
): Promise<ProjectDatabaseConnectionQueryModeGetApiResult> {
  return apiFetch<ProjectDatabaseConnectionQueryModeGetApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-mode`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function createProjectDatabaseConnectionQueryTemplateViaApi(
  projectId: string,
  connectionId: string,
  payload: {
    name: string;
    description: string;
    sqlText: string;
    queryBody?: Record<string, unknown> | null;
    parameterSchema?: Record<string, unknown> | null;
    cardConfig?: QueryTemplateCardConfig | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<ProjectDatabaseConnectionQueryTemplateCreateApiResult> {
  return apiFetch<ProjectDatabaseConnectionQueryTemplateCreateApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-templates`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function updateProjectDatabaseConnectionQueryTemplateViaApi(
  projectId: string,
  connectionId: string,
  templateId: string,
  payload: {
    name: string;
    description: string;
    sqlText: string;
    queryBody?: Record<string, unknown> | null;
    parameterSchema?: Record<string, unknown> | null;
    cardConfig?: QueryTemplateCardConfig | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<ProjectDatabaseConnectionQueryTemplateUpdateApiResult> {
  return apiFetch<ProjectDatabaseConnectionQueryTemplateUpdateApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function deleteProjectDatabaseConnectionQueryTemplateViaApi(
  projectId: string,
  connectionId: string,
  templateId: string,
): Promise<ProjectDatabaseConnectionQueryTemplateDeleteApiResult> {
  return apiFetch<ProjectDatabaseConnectionQueryTemplateDeleteApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-templates/${encodeURIComponent(templateId)}`,
    {
      method: 'DELETE',
      headers: jsonHeaders,
      cache: 'no-store',
    },
  );
}

export async function updateProjectDatabaseConnectionQueryModeViaApi(
  projectId: string,
  connectionId: string,
  payload: { queryMode: 'generated' | 'template_preferred' | 'template_only' },
): Promise<ProjectDatabaseConnectionQueryModeUpdateApiResult> {
  return apiFetch<ProjectDatabaseConnectionQueryModeUpdateApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(connectionId)}/query-mode`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function downloadProjectDatabaseSchemaZipViaApi(
  projectId: string,
  schemaId: string,
): Promise<{ ok: true; blob: Blob; fileName: string } | { ok: false; message: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/database/schemas/${encodeURIComponent(schemaId)}/download`,
    { method: 'GET', cache: 'no-store' },
  );
  const cd = res.headers.get('Content-Disposition');
  let fileName = 'database.zip';
  if (cd) {
    const m = /filename="([^"]+)"/.exec(cd);
    if (m?.[1]) fileName = m[1];
  }
  if (!res.ok) {
    try {
      const j = (await res.json()) as { message?: string };
      return { ok: false, message: j.message ?? 'Download failed.' };
    } catch {
      return { ok: false, message: 'Download failed.' };
    }
  }
  const blob = await res.blob();
  return { ok: true, blob, fileName };
}
