/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import { splitFileNameAndExt } from '@/lib/storage/storage-format';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const DOCUMENTS_STORAGE_BUCKET =
  process.env.SUPABASE_DOCUMENTS_STORAGE_BUCKET?.trim() || 'documents-storage';
export const DOCUMENTS_DUMP_BUCKET =
  process.env.SUPABASE_DOCUMENTS_DUMP_BUCKET?.trim() || 'documents-dump';

export function parseDbBigintToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getProjectContextForCurrentUser(projectId: string): Promise<
  | {
      ok: true;
      organizationId: string;
      projectId: string;
      projectAgentRows: {
        projectAgentId: string;
        agentId: string;
        requiresDocumentEmbedding: boolean;
      }[];
    }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' }
> {
  const pid = String(projectId ?? '').trim();
  if (!pid) return { ok: false, message: 'Missing project id.', code: 'NOT_FOUND' };

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!authData.user) return { ok: false, message: 'Unauthorized' };

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', pid)
    .eq('is_deleted', false)
    .maybeSingle();

  if (projectError) return { ok: false, message: projectError.message };
  if (!projectRow) return { ok: false, message: 'Project not found.', code: 'NOT_FOUND' };

  const { data: memberRow, error: memberError } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('organization_id', projectRow.organization_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (memberError) return { ok: false, message: memberError.message };
  if (!memberRow) {
    return {
      ok: false,
      message: 'You do not have access to this project.',
      code: 'FORBIDDEN',
    };
  }

  const { data: projectAgentRows, error: paError } = await supabase
    .from('project_agents')
    .select('id, agent_id')
    .eq('project_id', pid)
    .eq('is_deleted', false);

  if (paError) return { ok: false, message: paError.message };

  const agentIds = [
    ...new Set((projectAgentRows ?? []).map((r: { agent_id: string }) => r.agent_id)),
  ];

  const requiresEmbeddingByAgentId = new Map<string, boolean>();
  if (agentIds.length > 0) {
    const { data: agentRows, error: agentsError } = await supabase
      .from('agents')
      .select('id, requires_document_embedding')
      .in('id', agentIds)
      .eq('is_deleted', false);

    if (agentsError) return { ok: false, message: agentsError.message };

    for (const row of agentRows ?? []) {
      const id = (row as { id: string }).id;
      const flag = Boolean((row as { requires_document_embedding?: boolean }).requires_document_embedding);
      requiresEmbeddingByAgentId.set(id, flag);
    }
  }

  return {
    ok: true,
    organizationId: projectRow.organization_id,
    projectId: pid,
    projectAgentRows: (projectAgentRows ?? []).map((r: { id: string; agent_id: string }) => ({
      projectAgentId: r.id,
      agentId: r.agent_id,
      requiresDocumentEmbedding: requiresEmbeddingByAgentId.get(r.agent_id) ?? false,
    })),
  };
}

export type ProjectContextForCurrentUser = Awaited<
  ReturnType<typeof getProjectContextForCurrentUser>
>;

export async function getOrgStorageLimitBytes(
  organizationId: string,
): Promise<{ ok: true; allowedBytes: number | null; allowedMb: number | null } | { ok: false; message: string }> {
  const supabase = await getSupabaseServerClient();

  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('plan_id')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgError) return { ok: false, message: orgError.message };
  if (!orgRow?.plan_id) return { ok: false, message: 'Plan not found for organization.' };

  const { data: planRow, error: planError } = await supabase
    .from('plans')
    .select('max_document_storage_mb_per_org')
    .eq('id', orgRow.plan_id)
    .maybeSingle();

  if (planError) return { ok: false, message: planError.message };

  const mbPerOrgRaw = (planRow as { max_document_storage_mb_per_org?: unknown } | null)?.max_document_storage_mb_per_org;
  const mbPerOrg = typeof mbPerOrgRaw === 'number' ? mbPerOrgRaw : parseDbBigintToNumber(mbPerOrgRaw);

  if (mbPerOrg < 0) return { ok: true, allowedBytes: null, allowedMb: null };

  const allowedBytes = mbPerOrg * 1024 * 1024;
  return { ok: true, allowedBytes, allowedMb: mbPerOrg };
}

export async function getOrgUsedDocumentBytes(organizationId: string): Promise<
  | { ok: true; usedBytes: number }
  | { ok: false; message: string }
> {
  const supabase = await getSupabaseServerClient();

  const { data: docs, error } = await supabase
    .from('documents')
    .select('file_size_bytes')
    .eq('organization_id', organizationId)
    .eq('is_deleted', false);

  if (error) return { ok: false, message: error.message };

  const usedBytes = (docs ?? []).reduce(
    (acc: number, row: { file_size_bytes: unknown }) => acc + parseDbBigintToNumber(row.file_size_bytes),
    0,
  );

  return { ok: true, usedBytes };
}

export function buildStoragePath(args: {
  organizationId: string;
  projectId: string;
  agentId: string;
  fileName: string;
}): string {
  const safeFileName = String(args.fileName ?? '').replaceAll('/', '_').replaceAll('\\', '_');
  return `${args.organizationId}/${args.projectId}/${args.agentId}/${safeFileName}`;
}

export async function assertDocumentUploadExtensionAllowed(
  supabase: SupabaseClient,
  fileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { extLowerNoDot } = splitFileNameAndExt(fileName);
  if (!extLowerNoDot) {
    return {
      ok: false,
      message: 'Files must have an allowed extension (for example .pdf or .txt).',
    };
  }

  const { data, error } = await supabase
    .from('document_allowed_extensions')
    .select('id')
    .eq('extension', extLowerNoDot)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) {
    return { ok: false, message: `.${extLowerNoDot} is not allowed.` };
  }
  return { ok: true };
}

