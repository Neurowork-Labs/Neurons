/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

import type { StorageListApiResult } from '@/lib/storage/storage-types';
import { getFileExtensionLower } from '@/lib/storage/storage-format';
import { syncDocumentProcessingJobsForProject } from '@/lib/document-processing/sync-document-jobs-for-project';
import {
  getProjectContextForCurrentUser,
  getOrgStorageLimitBytes,
  getOrgUsedDocumentBytes,
  DOCUMENTS_STORAGE_BUCKET,
  parseDbBigintToNumber,
} from '@/lib/storage/storage-server-helpers';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function listProjectStorageForCurrentUser(
  projectId: string,
): Promise<StorageListApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return { ok: false, message: context.message, code: context.code };

  await syncDocumentProcessingJobsForProject(projectId, { context });

  const [limitRes, usedRes] = await Promise.all([
    getOrgStorageLimitBytes(context.organizationId),
    getOrgUsedDocumentBytes(context.organizationId),
  ]);

  if (!limitRes.ok) return { ok: false, message: limitRes.message };
  if (!usedRes.ok) return { ok: false, message: usedRes.message };

  const { allowedBytes, allowedMb } = limitRes;
  const { usedBytes } = usedRes;

  const usagePercent =
    allowedBytes == null || allowedBytes <= 0 ? 0 : (usedBytes / allowedBytes) * 100;

  const usage = {
    allowedBytes,
    allowedMb,
    usedBytes,
    usedMb: usedBytes / (1024 * 1024),
    usagePercent,
  };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);

  if (projectAgentIds.length === 0) {
    return {
      ok: true,
      usage,
      documents: [],
      formatOptions: [{ value: 'all', label: 'All formats' }],
      uploadAgentOptions: [],
    };
  }

  const supabase = await getSupabaseServerClient();

  const agentIds = [...new Set(context.projectAgentRows.map((row) => row.agentId))];
  const { data: agentRows, error: agentsError } = await supabase
    .from('agents')
    .select('id, display_name')
    .in('id', agentIds);
  if (agentsError) return { ok: false, message: agentsError.message };

  const agentDisplayNameById = new Map<string, string>();
  for (const row of (agentRows ?? []) as Array<{ id: string; display_name: string | null }>) {
    agentDisplayNameById.set(row.id, String(row.display_name ?? '—'));
  }

  const agentIdByProjectAgentId = new Map<string, string>();
  const requiresEmbeddingByProjectAgentId = new Map<string, boolean>();
  for (const row of context.projectAgentRows) {
    agentIdByProjectAgentId.set(row.projectAgentId, row.agentId);
    requiresEmbeddingByProjectAgentId.set(
      row.projectAgentId,
      Boolean(row.requiresDocumentEmbedding),
    );
  }

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id,file_name,file_type,file_size_bytes,status,created_at,project_agent_id')
    .eq('storage_bucket', DOCUMENTS_STORAGE_BUCKET)
    .in('project_agent_id', projectAgentIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, message: error.message };

  const docRows = docs ?? [];
  const docIdsForJobs = docRows.map((d) => String((d as { id: string }).id));
  const activeJobDocIds = new Set<string>();
  const chunkedDocIds = new Set<string>();

  if (docIdsForJobs.length > 0) {
    const { data: jobRows, error: jobsError } = await supabase
      .from('document_processing_jobs')
      .select('document_id')
      .eq('project_id', projectId)
      .in('document_id', docIdsForJobs)
      .in('status', ['queued', 'processing']);

    if (jobsError) return { ok: false, message: jobsError.message };

    for (const j of jobRows ?? []) {
      const did = String((j as { document_id: string }).document_id);
      if (did) activeJobDocIds.add(did);
    }

    const { data: chunkRows, error: chunksError } = await supabase
      .from('document_chunks')
      .select('document_id')
      .in('document_id', docIdsForJobs);

    if (chunksError) return { ok: false, message: chunksError.message };
    for (const row of chunkRows ?? []) {
      const did = String((row as { document_id: string }).document_id);
      if (did) chunkedDocIds.add(did);
    }
  }

  const documents = docRows.map((d: Record<string, unknown>) => ({
    id: d.id as string,
    fileName: d.file_name as string,
    projectAgentId: String(d.project_agent_id),
    agentDisplayName:
      agentDisplayNameById.get(agentIdByProjectAgentId.get(String(d.project_agent_id)) ?? '') || '—',
    fileType: d.file_type as string,
    fileSizeBytes: parseDbBigintToNumber(d.file_size_bytes),
    status: d.status as string,
    uploadedAt: d.created_at as string,
    fileExtension: getFileExtensionLower(d.file_name as string),
    hasActiveEmbeddingJob: activeJobDocIds.has(String(d.id)),
    requiresDocumentEmbedding:
      requiresEmbeddingByProjectAgentId.get(String(d.project_agent_id)) ?? false,
    hasChunksCreated: chunkedDocIds.has(String(d.id)),
  }));

  const formatSet = new Set<string>();
  for (const doc of documents) formatSet.add(doc.fileExtension);
  const extOptions = [...formatSet.values()]
    .filter((e) => e && e !== 'unknown')
    .sort((a, b) => a.localeCompare(b))
    .map((ext) => ({
      value: ext,
      label: ext.toUpperCase(),
    }));

  const uploadAgentOptions = context.projectAgentRows
    .map((row) => ({
      projectAgentId: row.projectAgentId,
      agentDisplayName: agentDisplayNameById.get(row.agentId) || '—',
    }))
    .sort((a, b) => a.agentDisplayName.localeCompare(b.agentDisplayName));

  return {
    ok: true,
    usage,
    documents,
    formatOptions: [{ value: 'all', label: 'All formats' }, ...extOptions],
    uploadAgentOptions,
  };
}

