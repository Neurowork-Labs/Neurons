/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 *
 *  Reconciles public.document_processing_jobs → public.documents (and completion notifications)
 *  using the service role after the caller has verified org access with the user-scoped client.
 */

import { insertInAppNotificationForUser } from '@/lib/notifications/in-app-notification-db';
import {
  getProjectContextForCurrentUser,
  type ProjectContextForCurrentUser,
} from '@/lib/storage/storage-server-helpers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  getSupabaseServiceRoleClient,
  isSupabaseServiceRoleConfigured,
} from '@/lib/supabase/service-role';

export type LoadedProjectContext = Extract<ProjectContextForCurrentUser, { ok: true }>;

type JobRow = {
  id: string;
  document_id: string;
  status: string;
  last_error: string | null;
  completed_at: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  status: string;
  file_name: string;
  organization_id: string;
};

function getRequestedUserId(payload: Record<string, unknown> | null): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = payload.requested_by_user_id;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function syncDocumentProcessingJobsForProject(
  projectId: string,
  options?: { context?: LoadedProjectContext },
): Promise<
  { ok: true; updatedDocuments: number } | { ok: false; message: string; code?: string }
> {
  const userSb = await getSupabaseServerClient();
  const { data: authData, error: authError } = await userSb.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  let context = options?.context;
  if (!context) {
    const loaded = await getProjectContextForCurrentUser(projectId);
    if (!loaded.ok) {
      return { ok: false, message: loaded.message, code: loaded.code };
    }
    context = loaded;
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return { ok: true, updatedDocuments: 0 };
  }

  const adminSb = getSupabaseServiceRoleClient();
  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: true, updatedDocuments: 0 };
  }

  const { data: docs, error: docsError } = await adminSb
    .from('documents')
    .select('id, status, file_name, organization_id')
    .in('project_agent_id', projectAgentIds)
    .eq('is_deleted', false);

  if (docsError) {
    return { ok: false, message: docsError.message };
  }

  const docList = (docs ?? []) as DocumentRow[];
  const docIds = docList.map((d) => d.id);
  if (docIds.length === 0) {
    return { ok: true, updatedDocuments: 0 };
  }

  const { data: jobs, error: jobsError } = await adminSb
    .from('document_processing_jobs')
    .select('id, document_id, status, last_error, completed_at, payload, created_at')
    .eq('project_id', projectId)
    .in('document_id', docIds)
    .order('created_at', { ascending: false });

  if (jobsError) {
    return { ok: false, message: jobsError.message };
  }

  const latestJobByDoc = new Map<string, JobRow>();
  for (const j of (jobs ?? []) as JobRow[]) {
    if (!latestJobByDoc.has(j.document_id)) {
      latestJobByDoc.set(j.document_id, j);
    }
  }

  let updatedDocuments = 0;

  for (const doc of docList) {
    const job = latestJobByDoc.get(doc.id);
    if (!job) continue;

    if (job.status === 'processing') {
      if (doc.status === 'pending') {
        const { error } = await adminSb.from('documents').update({ status: 'processing' }).eq('id', doc.id);
        if (!error) {
          updatedDocuments += 1;
          doc.status = 'processing';
        }
      }
      continue;
    }

    if (job.status === 'failed') {
      if (doc.status !== 'failed') {
        const prevStatus = doc.status;
        const { error } = await adminSb
          .from('documents')
          .update({
            status: 'failed',
            error_message: job.last_error ?? 'Document processing failed.',
          })
          .eq('id', doc.id);
        if (!error) {
          updatedDocuments += 1;
          const notifyUserId = getRequestedUserId(job.payload);
          if (notifyUserId && prevStatus !== 'failed') {
            await insertInAppNotificationForUser(adminSb, {
              userId: notifyUserId,
              organizationId: doc.organization_id,
              projectId,
              agentId:
                typeof job.payload?.agent_id === 'string' ? (job.payload.agent_id as string) : null,
              typeName: 'agent_alert',
              title: 'Document processing failed',
              body: `"${doc.file_name}" could not be indexed. ${job.last_error ? `(${job.last_error})` : 'Try uploading again.'}`,
              actionUrl: `/project/${projectId}/storage`,
            });
          }
        }
      }
      continue;
    }

    if (job.status === 'completed') {
      if (doc.status === 'ready') continue;

      const { count, error: countError } = await adminSb
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', doc.id);

      if (countError) {
        continue;
      }

      const chunkCount = count ?? 0;
      const prevStatus = doc.status;

      const { error: upError } = await adminSb
        .from('documents')
        .update({
          status: 'ready',
          processed_at: job.completed_at ?? new Date().toISOString(),
          chunk_count: chunkCount,
          error_message: null,
        })
        .eq('id', doc.id);

      if (!upError) {
        updatedDocuments += 1;
        if (prevStatus !== 'ready') {
          const notifyUserId = getRequestedUserId(job.payload);
          if (notifyUserId) {
            await insertInAppNotificationForUser(adminSb, {
              userId: notifyUserId,
              organizationId: doc.organization_id,
              projectId,
              agentId:
                typeof job.payload?.agent_id === 'string' ? (job.payload.agent_id as string) : null,
              typeName: 'agent_alert',
              title: 'Document processing complete',
              body: `"${doc.file_name}" is indexed and ready for your agent.`,
              actionUrl: `/project/${projectId}/storage`,
            });
          }
        }
      }
    }
  }

  return { ok: true, updatedDocuments };
}
