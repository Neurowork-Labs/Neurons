/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/
'use client';

import { apiFetch } from '@/lib/auth/api-fetch';
import type {
  DeleteStorageDocumentApiResult,
  RenameStorageDocumentApiResult,
  StorageCheckUploadConflictApiResult,
  StorageListApiResult,
  StorageUploadApiResult,
} from '@/lib/storage/storage-types';

const jsonHeaders = { 'content-type': 'application/json' } as const;

export async function fetchProjectStorageViaApi(
  projectId: string,
): Promise<StorageListApiResult> {
  return apiFetch<StorageListApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/storage`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function checkProjectStorageUploadConflictViaApi(
  projectId: string,
  payload: { fileName: string; fileSizeBytes: number; projectAgentIds: string[] },
): Promise<StorageCheckUploadConflictApiResult> {
  const projectAgentIdsParam = payload.projectAgentIds.join(',');
  return apiFetch<StorageCheckUploadConflictApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/storage/check-upload?fileName=${encodeURIComponent(
      payload.fileName,
    )}&fileSizeBytes=${encodeURIComponent(String(payload.fileSizeBytes))}&projectAgentIds=${encodeURIComponent(
      projectAgentIdsParam,
    )}`,
    { method: 'GET', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function uploadProjectStorageDocumentViaApi(
  projectId: string,
  payload: { file: File; keepExisting: boolean; projectAgentIds: string[] },
): Promise<StorageUploadApiResult> {
  const form = new FormData();
  form.set('file', payload.file);
  form.set('keepExisting', String(payload.keepExisting));
  form.set('projectAgentIds', JSON.stringify(payload.projectAgentIds));

  return apiFetch<StorageUploadApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/storage/upload`,
    { method: 'POST', body: form, cache: 'no-store' },
  );
}

export async function renameProjectStorageDocumentViaApi(
  projectId: string,
  documentId: string,
  payload: { fileName: string },
): Promise<RenameStorageDocumentApiResult> {
  return apiFetch<RenameStorageDocumentApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/storage/documents/${encodeURIComponent(documentId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
}

export async function deleteProjectStorageDocumentViaApi(
  projectId: string,
  documentId: string,
): Promise<DeleteStorageDocumentApiResult> {
  return apiFetch<DeleteStorageDocumentApiResult>(
    `/api/projects/${encodeURIComponent(projectId)}/storage/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE', headers: jsonHeaders, cache: 'no-store' },
  );
}

export async function downloadProjectStorageDocumentViaApi(
  projectId: string,
  documentId: string,
  fileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/storage/documents/${encodeURIComponent(documentId)}/download`,
    { method: 'GET', credentials: 'include', cache: 'no-store' },
  );

  if (!res.ok) {
    let message = 'Could not download file.';
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === 'string' && j.message.trim()) message = j.message;
    } catch {
      /* ignore */
    }
    return { ok: false, message };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }

  return { ok: true };
}
