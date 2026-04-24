/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import type {
  DeleteStorageDocumentApiResult,
  RenameStorageDocumentApiResult,
} from '@/lib/storage/storage-types';
import {
  buildStoragePath,
  DOCUMENTS_DUMP_BUCKET,
  DOCUMENTS_STORAGE_BUCKET,
  getProjectContextForCurrentUser,
} from '@/lib/storage/storage-server-helpers';
import { splitFileNameAndExt } from '@/lib/storage/storage-format';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type DocumentRow = {
  id: string;
  project_agent_id: string;
  organization_id: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  is_deleted: boolean;
};

export async function renameProjectStorageDocumentForCurrentUser(
  projectId: string,
  documentId: string,
  payload: { fileName: string },
): Promise<RenameStorageDocumentApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  const docId = String(documentId ?? '').trim();
  const nextNameRaw = String(payload.fileName ?? '').trim();

  if (!docId) return { ok: false, message: 'Missing document id.', code: 'BAD_REQUEST' };
  if (!nextNameRaw) return { ok: false, message: 'File name is required.', code: 'BAD_REQUEST' };

  const projectAgentIdSet = new Set(context.projectAgentRows.map((r) => r.projectAgentId));
  const agentIdByProjectAgentId = new Map(
    context.projectAgentRows.map((r) => [r.projectAgentId, r.agentId] as const),
  );

  const supabase = await getSupabaseServerClient();

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id,project_agent_id,organization_id,file_name,storage_bucket,storage_path,is_deleted')
    .eq('id', docId)
    .maybeSingle();

  if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };
  if (!doc) return { ok: false, message: 'Document not found.', code: 'NOT_FOUND' };

  const row = doc as DocumentRow;
  if (row.is_deleted) return { ok: false, message: 'Document not found.', code: 'NOT_FOUND' };
  if (!projectAgentIdSet.has(row.project_agent_id)) {
    return { ok: false, message: 'You do not have access to this document.', code: 'FORBIDDEN' };
  }
  if (row.storage_bucket !== DOCUMENTS_STORAGE_BUCKET) {
    return { ok: false, message: 'Only active storage documents can be renamed.', code: 'BAD_REQUEST' };
  }

  const agentId = agentIdByProjectAgentId.get(row.project_agent_id);
  if (!agentId) return { ok: false, message: 'Agent mapping not found.', code: 'BAD_REQUEST' };

  const { extWithDot } = splitFileNameAndExt(row.file_name);
  let nextFileName = nextNameRaw.replaceAll('/', '_').replaceAll('\\', '_');
  if (extWithDot && !nextFileName.toLowerCase().endsWith(extWithDot.toLowerCase())) {
    nextFileName = `${nextFileName}${extWithDot}`;
  }

  const nextStoragePath = buildStoragePath({
    organizationId: context.organizationId,
    projectId: context.projectId,
    agentId,
    fileName: nextFileName,
  });

  if (nextStoragePath === row.storage_path && nextFileName === row.file_name) {
    return { ok: true, documentId: row.id, fileName: row.file_name };
  }

  const { data: conflict, error: conflictErr } = await supabase
    .from('documents')
    .select('id')
    .eq('project_agent_id', row.project_agent_id)
    .eq('storage_bucket', DOCUMENTS_STORAGE_BUCKET)
    .eq('storage_path', nextStoragePath)
    .eq('is_deleted', false)
    .maybeSingle();

  if (conflictErr) return { ok: false, message: conflictErr.message, code: 'BAD_REQUEST' };
  if (conflict?.id) {
    return { ok: false, message: 'A document with this name already exists.', code: 'BAD_REQUEST' };
  }

  const { error: moveErr } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .move(row.storage_path, nextStoragePath);
  if (moveErr) return { ok: false, message: moveErr.message, code: 'BAD_REQUEST' };

  const { error: updateErr } = await supabase
    .from('documents')
    .update({
      file_name: nextFileName,
      storage_path: nextStoragePath,
    })
    .eq('id', row.id);
  if (updateErr) return { ok: false, message: updateErr.message, code: 'BAD_REQUEST' };

  return { ok: true, documentId: row.id, fileName: nextFileName };
}

export async function deleteProjectStorageDocumentForCurrentUser(
  projectId: string,
  documentId: string,
): Promise<DeleteStorageDocumentApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  const docId = String(documentId ?? '').trim();
  if (!docId) return { ok: false, message: 'Missing document id.', code: 'BAD_REQUEST' };

  const projectAgentIdSet = new Set(context.projectAgentRows.map((r) => r.projectAgentId));
  const agentIdByProjectAgentId = new Map(
    context.projectAgentRows.map((r) => [r.projectAgentId, r.agentId] as const),
  );

  const supabase = await getSupabaseServerClient();

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id,project_agent_id,organization_id,file_name,storage_bucket,storage_path,is_deleted')
    .eq('id', docId)
    .maybeSingle();

  if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };
  if (!doc) return { ok: false, message: 'Document not found.', code: 'NOT_FOUND' };

  const row = doc as DocumentRow;
  if (row.is_deleted) return { ok: true, documentId: row.id };
  if (!projectAgentIdSet.has(row.project_agent_id)) {
    return { ok: false, message: 'You do not have access to this document.', code: 'FORBIDDEN' };
  }
  if (row.storage_bucket !== DOCUMENTS_STORAGE_BUCKET) {
    return { ok: false, message: 'Only active storage documents can be deleted.', code: 'BAD_REQUEST' };
  }

  const agentId = agentIdByProjectAgentId.get(row.project_agent_id);
  if (!agentId) return { ok: false, message: 'Agent mapping not found.', code: 'BAD_REQUEST' };

  const nowIso = new Date().toISOString();
  const { error: cancelJobsError } = await supabase
    .from('document_processing_jobs')
    .update({
      status: 'cancelled',
      completed_at: nowIso,
      last_error: 'Cancelled: document removed by user.',
    })
    .eq('document_id', docId)
    .in('status', ['queued', 'processing']);

  if (cancelJobsError) {
    return { ok: false, message: cancelJobsError.message, code: 'BAD_REQUEST' };
  }

  const dumpPath = buildStoragePath({
    organizationId: context.organizationId,
    projectId: context.projectId,
    agentId,
    fileName: `${row.id}__${row.file_name}`,
  });

  const downloadRes = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .download(row.storage_path);
  if (downloadRes.error) {
    return { ok: false, message: downloadRes.error.message, code: 'BAD_REQUEST' };
  }

  const dumpUploadRes = await supabase.storage
    .from(DOCUMENTS_DUMP_BUCKET)
    .upload(dumpPath, downloadRes.data, { upsert: false });
  if (dumpUploadRes.error) {
    return { ok: false, message: dumpUploadRes.error.message, code: 'BAD_REQUEST' };
  }

  const sourceRemoveRes = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .remove([row.storage_path]);
  if (sourceRemoveRes.error) {
    return { ok: false, message: sourceRemoveRes.error.message, code: 'BAD_REQUEST' };
  }

  const { error: updateErr } = await supabase
    .from('documents')
    .update({
      is_deleted: true,
      storage_bucket: DOCUMENTS_DUMP_BUCKET,
      storage_path: dumpPath,
    })
    .eq('id', row.id);
  if (updateErr) return { ok: false, message: updateErr.message, code: 'BAD_REQUEST' };

  const { error: deleteChunksErr } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', row.id);
  if (deleteChunksErr) return { ok: false, message: deleteChunksErr.message, code: 'BAD_REQUEST' };

  return { ok: true, documentId: row.id };
}

