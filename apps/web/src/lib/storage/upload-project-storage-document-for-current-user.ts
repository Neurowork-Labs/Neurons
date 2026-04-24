/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import type { StorageUploadApiResult } from '@/lib/storage/storage-types';
import {
  DOCUMENTS_STORAGE_BUCKET,
  assertDocumentUploadExtensionAllowed,
  buildStoragePath,
  getProjectContextForCurrentUser,
  getOrgStorageLimitBytes,
  getOrgUsedDocumentBytes,
  parseDbBigintToNumber,
} from '@/lib/storage/storage-server-helpers';
import {
  inferMimeTypeFromFileName,
  makeVersionedFileName,
  splitFileNameAndExt,
} from '@/lib/storage/storage-format';
import { getOrgPlanQueuePriority } from '@/lib/document-processing/org-queue-priority';
import { insertInAppNotificationForUser } from '@/lib/notifications/in-app-notification-db';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function uploadProjectStorageDocumentForCurrentUser(
  projectId: string,
  payload: { file: File; keepExisting: boolean; projectAgentIds: string[] },
): Promise<StorageUploadApiResult> {
  const keepExisting = Boolean(payload.keepExisting);
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  const file = payload.file;
  if (!file) return { ok: false, message: 'Missing file.', code: 'BAD_REQUEST' };

  const fileNameRaw = String(file.name ?? '').trim();
  const fileTypeRaw = String(file.type ?? '').trim();
  const fileSizeBytesRaw = file.size;

  const fileSizeBytes = Number(fileSizeBytesRaw ?? 0);
  if (!fileNameRaw) return { ok: false, message: 'Missing file name.', code: 'BAD_REQUEST' };
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { ok: false, message: 'Invalid file size.', code: 'BAD_REQUEST' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const extAllowed = await assertDocumentUploadExtensionAllowed(supabase, fileNameRaw);
  if (!extAllowed.ok) {
    return { ok: false, message: extAllowed.message, code: 'BAD_REQUEST' };
  }

  const fileType = fileTypeRaw || inferMimeTypeFromFileName(fileNameRaw);

  const limitRes = await getOrgStorageLimitBytes(context.organizationId);
  if (!limitRes.ok) return { ok: false, message: limitRes.message };

  const usedRes = await getOrgUsedDocumentBytes(context.organizationId);
  if (!usedRes.ok) return { ok: false, message: usedRes.message };

  const allProjectAgentRows = context.projectAgentRows;
  if (allProjectAgentRows.length === 0) {
    return { ok: false, message: 'No connected agents found for this project.', code: 'NOT_FOUND' };
  }

  const allProjectAgentIdSet = new Set(allProjectAgentRows.map((row) => row.projectAgentId));
  const selectedProjectAgentIdSet = new Set(
    payload.projectAgentIds
      .map((id) => String(id ?? '').trim())
      .filter((id) => id.length > 0 && allProjectAgentIdSet.has(id)),
  );

  const projectAgentRows = allProjectAgentRows.filter((row) =>
    selectedProjectAgentIdSet.has(row.projectAgentId),
  );
  if (projectAgentRows.length === 0) {
    return { ok: false, message: 'Select at least one valid connected agent.', code: 'BAD_REQUEST' };
  }

  const baseFileName = fileNameRaw;

  // Pre-check conflicts per agent so we can correctly enforce quota.
  const existingBaseByAgentId: Record<
    string,
    { documentId: string; fileSizeBytes: number }
  > = {};

  let existingBaseBytesSum = 0;
  for (const pa of projectAgentRows) {
    const baseStoragePath = buildStoragePath({
      organizationId: context.organizationId,
      projectId: context.projectId,
      agentId: pa.agentId,
      fileName: baseFileName,
    });

    const { data: existingDoc, error } = await supabase
      .from('documents')
      .select('id,file_size_bytes')
      .eq('project_agent_id', pa.projectAgentId)
      .eq('storage_bucket', DOCUMENTS_STORAGE_BUCKET)
      .eq('storage_path', baseStoragePath)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };

    if (existingDoc?.id) {
      const existingSize = parseDbBigintToNumber((existingDoc as { file_size_bytes?: unknown }).file_size_bytes);
      existingBaseByAgentId[pa.projectAgentId] = {
        documentId: existingDoc.id as string,
        fileSizeBytes: existingSize,
      };
      existingBaseBytesSum += existingSize;
    }
  }

  const agentCount = projectAgentRows.length;
  const resultingUsedBytes = keepExisting
    ? usedRes.usedBytes + fileSizeBytes * agentCount
    : usedRes.usedBytes - existingBaseBytesSum + fileSizeBytes * agentCount;

  if (resultingUsedBytes < 0) {
    return { ok: false, message: 'Storage usage calculation failed.', code: 'BAD_REQUEST' };
  }

  if (limitRes.allowedBytes != null && limitRes.allowedBytes >= 0) {
    if (resultingUsedBytes > limitRes.allowedBytes) {
      return {
        ok: false,
        message: 'Storage quota exceeded for your organization.',
        code: 'QUOTA_EXCEEDED',
      };
    }
  }

  const queuePriority = await getOrgPlanQueuePriority(supabase, context.organizationId);

  const agentIdsForLabels = [...new Set(projectAgentRows.map((r) => r.agentId))];
  const { data: agentLabelRows, error: agentLabelErr } = await supabase
    .from('agents')
    .select('id, display_name')
    .in('id', agentIdsForLabels)
    .eq('is_deleted', false);
  if (agentLabelErr) return { ok: false, message: agentLabelErr.message, code: 'BAD_REQUEST' };

  const agentDisplayNameById = new Map<string, string>();
  for (const row of agentLabelRows ?? []) {
    agentDisplayNameById.set(
      (row as { id: string }).id,
      String((row as { display_name?: string }).display_name ?? '—'),
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const uploadedDocumentIds: string[] = [];

  for (const pa of projectAgentRows) {
    const baseStoragePath = buildStoragePath({
      organizationId: context.organizationId,
      projectId: context.projectId,
      agentId: pa.agentId,
      fileName: baseFileName,
    });

    const baseExisting = existingBaseByAgentId[pa.projectAgentId];

    let targetFileName = baseFileName;
    let targetStoragePath = baseStoragePath;

    if (keepExisting && baseExisting) {
      // Version the *new* upload by generating a non-conflicting __vN name.
      const { baseName: bn, extWithDot: ewd } = splitFileNameAndExt(baseFileName);

      const ilikePattern = ewd
        ? `${bn}__v%${ewd}`
        : `${bn}__v%`;

      const { data: versionDocs, error: versionErr } = await supabase
        .from('documents')
        .select('file_name')
        .eq('project_agent_id', pa.projectAgentId)
        .eq('storage_bucket', DOCUMENTS_STORAGE_BUCKET)
        .eq('is_deleted', false)
        .ilike('file_name', ilikePattern);

      if (versionErr) return { ok: false, message: versionErr.message, code: 'BAD_REQUEST' };

      const versionRegex = new RegExp(
        `^${escapeRegex(bn)}__v(\\d+)${escapeRegex(ewd)}$`,
      );

      let maxVersion = 1; // base file without suffix is considered v1
      for (const vd of versionDocs ?? []) {
        const m = versionRegex.exec(String((vd as { file_name?: unknown }).file_name ?? ''));
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n)) maxVersion = Math.max(maxVersion, n);
      }

      const nextVersion = Math.max(2, maxVersion + 1);
      targetFileName = makeVersionedFileName(baseFileName, nextVersion);
      targetStoragePath = buildStoragePath({
        organizationId: context.organizationId,
        projectId: context.projectId,
        agentId: pa.agentId,
        fileName: targetFileName,
      });
    }

    if (!keepExisting && baseExisting) {
      // Replace: remove the old object + its DB row (chunks cascade via FK).
      try {
        await supabase.storage.from(DOCUMENTS_STORAGE_BUCKET).remove([baseStoragePath]);
      } catch {
        // Storage might already be missing; DB delete is still authoritative.
      }
      const { error: deleteErr } = await supabase
        .from('documents')
        .delete()
        .eq('id', baseExisting.documentId);
      if (deleteErr) return { ok: false, message: deleteErr.message, code: 'BAD_REQUEST' };
    }

    const { error: uploadErr } = await supabase.storage
      .from(DOCUMENTS_STORAGE_BUCKET)
      .upload(targetStoragePath, bytes, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadErr) {
      return { ok: false, message: uploadErr.message, code: 'BAD_REQUEST' };
    }

    const needsEmbedding = Boolean(pa.requiresDocumentEmbedding);
    const nowIso = new Date().toISOString();
    const isDbSchemaFile = false;
    const isDbDataFile = false;

    const { data: insertedRows, error: insertErr } = await supabase
      .from('documents')
      .insert({
        project_agent_id: pa.projectAgentId,
        organization_id: context.organizationId,
        file_name: targetFileName,
        file_type: fileType,
        file_size_bytes: fileSizeBytes,
        storage_bucket: DOCUMENTS_STORAGE_BUCKET,
        storage_path: targetStoragePath,
        status: needsEmbedding ? 'pending' : 'ready',
        chunk_count: 0,
        processed_at: needsEmbedding ? null : nowIso,
        is_db_schema_file: isDbSchemaFile,
        is_db_data_file: isDbDataFile,
      })
      .select('id');

    if (insertErr) return { ok: false, message: insertErr.message, code: 'BAD_REQUEST' };

    const inserted = insertedRows?.[0]?.id as string | undefined;
    if (inserted) uploadedDocumentIds.push(inserted);

    if (inserted && needsEmbedding && !isDbSchemaFile && !isDbDataFile) {
      const { error: jobErr } = await supabase.from('document_processing_jobs').insert({
        organization_id: context.organizationId,
        project_id: context.projectId,
        document_id: inserted,
        status: 'queued',
        job_type: 'embed_document',
        priority: queuePriority,
        max_attempts: 2,
        payload: {
          document_id: inserted,
          file_path: targetStoragePath,
          storage_bucket: DOCUMENTS_STORAGE_BUCKET,
          project_agent_id: pa.projectAgentId,
          agent_id: pa.agentId,
          requested_by_user_id: authRow.user.id,
          file_name: targetFileName,
          file_type: fileType,
        },
      });

      if (jobErr) {
        return { ok: false, message: jobErr.message, code: 'BAD_REQUEST' };
      }

      const agentLabel = agentDisplayNameById.get(pa.agentId) ?? 'your agent';
      const notif = await insertInAppNotificationForUser(supabase, {
        userId: authRow.user.id,
        organizationId: context.organizationId,
        projectId: context.projectId,
        agentId: pa.agentId,
        typeName: 'agent_alert',
        title: 'Document queued for embedding',
        body: `"${targetFileName}" is queued for processing (${agentLabel}).`,
        actionUrl: `/project/${context.projectId}/storage`,
      });

      if (!notif.ok) {
        console.warn('[upload] notification insert failed:', notif.message);
      }
    }
  }

  return { ok: true, uploadedDocumentIds };
}

