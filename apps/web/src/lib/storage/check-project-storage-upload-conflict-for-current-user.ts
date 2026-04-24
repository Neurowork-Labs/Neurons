/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import type { StorageCheckUploadConflictApiResult } from '@/lib/storage/storage-types';
import {
  DOCUMENTS_STORAGE_BUCKET,
  assertDocumentUploadExtensionAllowed,
  buildStoragePath,
  getProjectContextForCurrentUser,
} from '@/lib/storage/storage-server-helpers';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function checkProjectStorageUploadConflictForCurrentUser(
  projectId: string,
  payload: { fileName: string; fileSizeBytes: number; projectAgentIds: string[] },
): Promise<StorageCheckUploadConflictApiResult> {
  const fileName = String(payload.fileName ?? '').trim();
  const fileSizeBytes = Number(payload.fileSizeBytes ?? 0);
  if (!fileName) return { ok: false, message: 'Missing file name.', code: 'NOT_FOUND' };
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { ok: false, message: 'Invalid file size.', code: 'NOT_FOUND' };
  }

  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  const projectAgentIdSet = new Set(
    context.projectAgentRows.map((row) => row.projectAgentId),
  );
  const selectedProjectAgentIds = payload.projectAgentIds
    .map((id) => String(id ?? '').trim())
    .filter((id) => id.length > 0 && projectAgentIdSet.has(id));

  if (selectedProjectAgentIds.length === 0) {
    return {
      ok: false,
      message: 'Select at least one valid connected agent.',
      code: 'BAD_REQUEST',
    } as StorageCheckUploadConflictApiResult;
  }

  const agentIdByProjectAgentId = new Map(
    context.projectAgentRows.map((row) => [row.projectAgentId, row.agentId] as const),
  );

  const supabase = await getSupabaseServerClient();

  const extAllowed = await assertDocumentUploadExtensionAllowed(supabase, fileName);
  if (!extAllowed.ok) {
    return { ok: false, message: extAllowed.message, code: 'BAD_REQUEST' };
  }

  let conflict = false;

  for (const projectAgentId of selectedProjectAgentIds) {
    const agentId = agentIdByProjectAgentId.get(projectAgentId);
    if (!agentId) continue;
    const storagePath = buildStoragePath({
      organizationId: context.organizationId,
      projectId: context.projectId,
      agentId,
      fileName,
    });

    const { data: existingDoc, error } = await supabase
      .from('documents')
      .select('id')
      .eq('project_agent_id', projectAgentId)
      .eq('storage_bucket', DOCUMENTS_STORAGE_BUCKET)
      .eq('storage_path', storagePath)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (existingDoc) {
      conflict = true;
      break;
    }
  }

  return { ok: true, conflict };
}

