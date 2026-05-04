/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

import {
  DOCUMENTS_STORAGE_BUCKET,
  getProjectContextForCurrentUser,
} from '@/lib/storage/storage-server-helpers';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type DocumentRow = {
  id: string;
  project_agent_id: string;
  file_name: string;
  file_type: string;
  storage_bucket: string;
  storage_path: string;
  is_deleted: boolean;
};

export async function downloadProjectStorageDocumentForCurrentUser(
  projectId: string,
  documentId: string,
): Promise<
  | { ok: true; body: Blob; contentType: string; fileName: string }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST';
    }
> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  const docId = String(documentId ?? '').trim();
  if (!docId) return { ok: false, message: 'Missing document id.', code: 'BAD_REQUEST' };

  const projectAgentIdSet = new Set(context.projectAgentRows.map((r) => r.projectAgentId));

  const supabase = await getSupabaseServerClient();

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select(
      'id,project_agent_id,file_name,file_type,storage_bucket,storage_path,is_deleted',
    )
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
    return {
      ok: false,
      message: 'Only active storage documents can be downloaded.',
      code: 'BAD_REQUEST',
    };
  }

  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .download(row.storage_path);

  if (dlErr) return { ok: false, message: dlErr.message, code: 'BAD_REQUEST' };
  if (!fileBlob) return { ok: false, message: 'Empty file.', code: 'BAD_REQUEST' };

  return {
    ok: true,
    body: fileBlob,
    contentType: row.file_type?.trim() || 'application/octet-stream',
    fileName: row.file_name,
  };
}
