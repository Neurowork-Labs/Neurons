/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import JSZip from 'jszip';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  buildStoragePath,
  getProjectContextForCurrentUser,
  parseDbBigintToNumber,
} from '@/lib/storage/storage-server-helpers';
import { splitFileNameAndExt } from '@/lib/storage/storage-format';
import type {
  DbFilePurpose,
  ProjectDatabaseDeleteApiResult,
  ProjectDatabaseDownloadZipApiResult,
  ProjectDatabaseLookupsApiResult,
  ProjectDatabaseRenameApiResult,
  ProjectDatabaseSchemasListApiResult,
  ProjectDatabaseUpdateDataFileApiResult,
  ProjectDatabaseUpdateFilesApiResult,
  ProjectDatabaseUploadAgentOption,
  ProjectDatabaseUploadApiResult,
  ProjectDatabaseUploadCheckApiResult,
} from '@/lib/project-database/project-database-types';
import { listLiveDatabaseConnectionsForCurrentUser } from '@/lib/database-connection/database-connection-server';
import { extractDatabaseTablesFromDataJson } from '@/lib/project-database/export-layouts/extract-database-tables-from-data-json';
import { replaceSchemaTableDataRows } from '@/lib/project-database/replace-schema-table-data-rows';

const DATABASE_FILES_STORAGE_BUCKET =
  process.env.SUPABASE_DATABASE_FILES_STORAGE_BUCKET?.trim() || 'database-files-storage';

const DATABASE_FILES_DUMP_BUCKET =
  process.env.SUPABASE_DATABASE_FILES_DUMP_BUCKET?.trim() || 'database-files-dump';

type SupabaseServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function moveDatabaseObjectFromStorageToDumpBucket(
  supabase: SupabaseServerClient,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(DATABASE_FILES_STORAGE_BUCKET)
    .download(storagePath);
  if (dlErr) return { ok: false, message: dlErr.message };

  const buf = Buffer.from(await fileBlob.arrayBuffer());
  const lower = storagePath.toLowerCase();
  const contentType = lower.endsWith('.sql')
    ? 'text/sql'
    : lower.endsWith('.json')
      ? 'application/json'
      : 'application/octet-stream';

  const { error: upErr } = await supabase.storage
    .from(DATABASE_FILES_DUMP_BUCKET)
    .upload(storagePath, buf, { contentType, upsert: true });
  if (upErr) return { ok: false, message: upErr.message };

  const { error: rmErr } = await supabase.storage.from(DATABASE_FILES_STORAGE_BUCKET).remove([storagePath]);
  if (rmErr) return { ok: false, message: rmErr.message };

  return { ok: true };
}

function normalizePagination(raw: { page?: number; pageSize?: number }) {
  const page = Number.isFinite(raw.page) && (raw.page as number) > 0 ? (raw.page as number) : 1;
  const pageSize =
    Number.isFinite(raw.pageSize) && (raw.pageSize as number) > 0
      ? Math.min(50, Math.max(1, raw.pageSize as number))
      : 15;
  return { page, pageSize };
}

async function loadExportLayoutFormatPlatformForSchema(
  supabase: SupabaseServerClient,
  databaseExportLayoutId: string | null | undefined,
): Promise<{ ok: true; format: string; platform: string } | { ok: false; message: string }> {
  const id = databaseExportLayoutId ? String(databaseExportLayoutId).trim() : '';
  if (!id) {
    return { ok: true, format: 'json', platform: 'generic' };
  }
  const { data: lay, error } = await supabase
    .from('database_export_layouts')
    .select('format,platform')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!lay) {
    return { ok: false, message: 'Export layout not found for this database schema.' };
  }
  return {
    ok: true,
    format: String((lay as { format?: string }).format ?? 'json'),
    platform: String((lay as { platform?: string }).platform ?? 'generic'),
  };
}

async function assertDbFileExtensionAllowed(args: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  fileName: string;
  purpose: DbFilePurpose;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { extLowerNoDot } = splitFileNameAndExt(args.fileName);
  if (!extLowerNoDot) {
    return { ok: false, message: 'Files must have an extension (for example .sql or .json).' };
  }

  const { data: purposeRow, error: purposeErr } = await args.supabase
    .from('document_db_file_purposes')
    .select('id')
    .eq('file_purpose', args.purpose)
    .maybeSingle();
  if (purposeErr) return { ok: false, message: purposeErr.message };
  if (!purposeRow?.id) return { ok: false, message: 'File purpose is not configured.' };

  const { data: allowedRow, error: allowedErr } = await args.supabase
    .from('document_db_file_allowed_extensions')
    .select('id')
    .eq('file_extension', extLowerNoDot)
    .eq('file_for', purposeRow.id)
    .maybeSingle();
  if (allowedErr) return { ok: false, message: allowedErr.message };
  if (!allowedRow) return { ok: false, message: `.${extLowerNoDot} is not allowed for ${args.purpose}.` };

  return { ok: true };
}

export async function listProjectDatabaseSchemasForCurrentUser(
  projectId: string,
  query: { page?: number; pageSize?: number; search?: string; fetchAll?: boolean },
): Promise<ProjectDatabaseSchemasListApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const fetchAll = Boolean(query.fetchAll);
  const { page, pageSize } = fetchAll
    ? { page: 1, pageSize: 15 }
    : normalizePagination(query);
  const searchRaw = String(query.search ?? '').trim();
  const search = searchRaw.toLowerCase();

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: true, schemas: [], total: 0, page: 1, pageSize };
  }

  const { data, error } = await supabase
    .from('document_database_schemas')
    .select('id,database_name,database_id,status,created_at,project_agent_id,document_id')
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };

  type SchemaRow = {
    id: string;
    database_name: string;
    database_id: string | null;
    status: string;
    created_at: string;
    project_agent_id: string;
    document_id: string;
  };

  const schemaRows = (data as unknown as SchemaRow[] | null | undefined) ?? [];

  const liveRes = await listLiveDatabaseConnectionsForCurrentUser(projectId);
  const liveRows = liveRes.ok ? liveRes.rows : [];

  const dbIds = [
    ...new Set([
      ...schemaRows.map((r) => r.database_id).filter((id): id is string => Boolean(id)),
      ...liveRows.map((r) => r.databaseId).filter((id): id is string => Boolean(id)),
    ]),
  ];

  const agentIds = [...new Set(context.projectAgentRows.map((r) => r.agentId))];
  const agentDisplayNameById = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agentRows, error: agentsErr } = await supabase
      .from('agents')
      .select('id, display_name')
      .in('id', agentIds);
    if (agentsErr) return { ok: false, message: agentsErr.message, code: 'BAD_REQUEST' };
    for (const row of (agentRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      agentDisplayNameById.set(row.id, String(row.display_name ?? '—'));
    }
  }
  const agentNameByProjectAgentId = new Map<string, string>();
  for (const pa of context.projectAgentRows) {
    agentNameByProjectAgentId.set(
      pa.projectAgentId,
      agentDisplayNameById.get(pa.agentId) ?? '—',
    );
  }

  const schemaIds = schemaRows.map((r) => r.id);
  const dataDocIdsBySchemaId = new Map<string, string[]>();
  if (schemaIds.length > 0) {
    const { data: tdRows, error: tdErr } = await supabase
      .from('document_database_table_data')
      .select('schema_id, document_id')
      .in('schema_id', schemaIds);
    if (tdErr) return { ok: false, message: tdErr.message, code: 'BAD_REQUEST' };
    for (const row of (tdRows ?? []) as Array<{ schema_id: string; document_id: string }>) {
      const sid = row.schema_id;
      const list = dataDocIdsBySchemaId.get(sid) ?? [];
      list.push(row.document_id);
      dataDocIdsBySchemaId.set(sid, list);
    }
  }

  const allDocIds = new Set<string>();
  for (const r of schemaRows) {
    allDocIds.add(r.document_id);
  }
  for (const ids of dataDocIdsBySchemaId.values()) {
    for (const id of ids) allDocIds.add(id);
  }

  const sizeByDocId = new Map<string, number>();
  if (allDocIds.size > 0) {
    const { data: docRows, error: docErr } = await supabase
      .from('documents')
      .select('id,file_size_bytes')
      .in('id', [...allDocIds])
      .eq('is_deleted', false);
    if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };
    for (const row of (docRows ?? []) as Array<{ id: string; file_size_bytes: unknown }>) {
      sizeByDocId.set(row.id, parseDbBigintToNumber(row.file_size_bytes));
    }
  }

  const dbMetaById = new Map<string, { typeName: string | null; productName: string | null }>();
  if (dbIds.length > 0) {
    const { data: dbRows, error: dbErr } = await supabase
      .from('databases')
      .select('id,name,database_types(name)')
      .in('id', dbIds);
    if (dbErr) return { ok: false, message: dbErr.message, code: 'BAD_REQUEST' };
    type DbJoinRow = {
      id: string;
      name: string;
      database_types?: { name?: string | null } | null;
    };
    for (const row of (dbRows as unknown as DbJoinRow[] | null | undefined) ?? []) {
      dbMetaById.set(row.id, {
        productName: row.name ?? null,
        typeName: row.database_types?.name ?? null,
      });
    }
  }

  const uploadSchemas = schemaRows.map((row) => {
    const meta = row.database_id ? dbMetaById.get(row.database_id) : undefined;
    const dataDocs = dataDocIdsBySchemaId.get(row.id) ?? [];
    let totalSize = sizeByDocId.get(row.document_id) ?? 0;
    for (const did of dataDocs) {
      totalSize += sizeByDocId.get(did) ?? 0;
    }
    return {
      id: row.id,
      databaseName: row.database_name,
      databaseId: row.database_id ?? null,
      projectAgentId: row.project_agent_id,
      agentDisplayName: agentNameByProjectAgentId.get(row.project_agent_id) ?? '—',
      databaseTypeName: meta?.typeName ?? null,
      databaseProductName: meta?.productName ?? null,
      status: row.status,
      totalSizeBytes: totalSize,
      createdAt: row.created_at,
      source: 'upload' as const,
      queryMode: null,
    };
  });

  const liveSchemas = liveRows.map((row) => {
    const meta = row.databaseId ? dbMetaById.get(row.databaseId) : undefined;
    return {
      id: row.id,
      databaseName: row.displayName,
      databaseId: row.databaseId,
      projectAgentId: row.projectAgentId,
      agentDisplayName: agentNameByProjectAgentId.get(row.projectAgentId) ?? '—',
      databaseTypeName: meta?.typeName ?? null,
      databaseProductName: meta?.productName ?? null,
      status: row.status,
      totalSizeBytes: 0,
      createdAt: row.createdAt,
      source: 'live' as const,
      queryMode: row.queryMode,
    };
  });

  let merged = [...uploadSchemas, ...liveSchemas];
  merged.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  if (search) {
    merged = merged.filter((s) => s.databaseName.toLowerCase().includes(search));
  }

  const totalRows = merged.length;

  if (fetchAll) {
    return {
      ok: true,
      schemas: merged,
      total: totalRows,
      page: 1,
      pageSize: totalRows,
    };
  }

  const start = (page - 1) * pageSize;
  const paged = merged.slice(start, start + pageSize);

  return {
    ok: true,
    schemas: paged,
    total: totalRows,
    page,
    pageSize,
  };
}

export async function fetchProjectDatabaseLookupsForCurrentUser(
  projectId: string,
): Promise<ProjectDatabaseLookupsApiResult> {
  // Ensure user has access to the project.
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const [
    { data: types, error: typesErr },
    { data: dbs, error: dbsErr },
    { data: exportLayoutRows, error: exportLayoutsErr },
  ] = await Promise.all([
    supabase.from('database_types').select('id,name').eq('is_active', true).order('name'),
    supabase
      .from('databases')
      .select('id,identifier,name,database_type_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('database_export_layouts')
      .select('id,format,platform')
      .eq('is_active', true)
      .order('format', { ascending: true })
      .order('platform', { ascending: true }),
  ]);

  if (typesErr) return { ok: false, message: typesErr.message, code: 'BAD_REQUEST' };
  if (dbsErr) return { ok: false, message: dbsErr.message, code: 'BAD_REQUEST' };
  if (exportLayoutsErr) return { ok: false, message: exportLayoutsErr.message, code: 'BAD_REQUEST' };

  const { data: allowed, error: allowedErr } = await supabase
    .from('document_db_file_allowed_extensions')
    .select('file_extension, document_db_file_purposes!inner(file_purpose)')
    .order('file_extension', { ascending: true });

  if (allowedErr) return { ok: false, message: allowedErr.message, code: 'BAD_REQUEST' };

  type DatabaseTypeRow = { id: string; name: string };
  type DatabaseRow = { id: string; identifier: string; name: string; database_type_id: string };
  type AllowedExtensionRow = {
    file_extension: string;
    document_db_file_purposes?: { file_purpose?: string | null } | null;
  };

  const agentIds = [...new Set(context.projectAgentRows.map((r) => r.agentId))];
  let uploadAgentOptions: ProjectDatabaseUploadAgentOption[] = [];
  if (agentIds.length > 0) {
    const { data: agentRows, error: agentsErr } = await supabase
      .from('agents')
      .select('id, display_name')
      .in('id', agentIds);
    if (agentsErr) return { ok: false, message: agentsErr.message, code: 'BAD_REQUEST' };
    const agentDisplayNameById = new Map<string, string>();
    for (const row of (agentRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      agentDisplayNameById.set(row.id, String(row.display_name ?? '—'));
    }
    uploadAgentOptions = context.projectAgentRows.map((pa) => ({
      projectAgentId: pa.projectAgentId,
      agentDisplayName: agentDisplayNameById.get(pa.agentId) ?? '—',
    }));
  }

  return {
    ok: true,
    databaseTypes: ((types as unknown as DatabaseTypeRow[] | null | undefined) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
    })),
    databases: ((dbs as unknown as DatabaseRow[] | null | undefined) ?? []).map((d) => ({
      id: d.id,
      identifier: d.identifier,
      name: d.name,
      databaseTypeId: d.database_type_id,
    })),
    allowedExtensions: ((allowed as unknown as AllowedExtensionRow[] | null | undefined) ?? []).map((row) => ({
      fileExtension: String(row.file_extension ?? '').toLowerCase(),
      purpose: String(row.document_db_file_purposes?.file_purpose ?? '') as DbFilePurpose,
    })),
    databaseExportLayouts: ((exportLayoutRows ?? []) as Array<{ id: string; format: string; platform: string }>).map(
      (row) => ({
        id: row.id,
        format: String(row.format ?? ''),
        platform: String(row.platform ?? ''),
      }),
    ),
    uploadAgentOptions,
  };
}

export async function checkDatabaseUploadConflictsForCurrentUser(
  projectId: string,
  payload: { databaseName: string; projectAgentIds: string[] },
): Promise<ProjectDatabaseUploadCheckApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const name = String(payload.databaseName ?? '').trim();
  if (!name) return { ok: false, message: 'Database name is required.', code: 'BAD_REQUEST' };

  const validPa = new Set(context.projectAgentRows.map((r) => r.projectAgentId));
  const agentIdByPa = new Map(context.projectAgentRows.map((r) => [r.projectAgentId, r.agentId] as const));

  const requested = [...new Set(payload.projectAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean))].filter(
    (id) => validPa.has(id),
  );

  const agentIds = [...new Set(requested.map((pa) => agentIdByPa.get(pa)).filter(Boolean))] as string[];
  const displayByAgentId = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agentRows, error: agentsErr } = await supabase
      .from('agents')
      .select('id, display_name')
      .in('id', agentIds);
    if (agentsErr) return { ok: false, message: agentsErr.message, code: 'BAD_REQUEST' };
    for (const row of (agentRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      displayByAgentId.set(row.id, String(row.display_name ?? '—'));
    }
  }

  if (requested.length === 0) return { ok: true, conflicts: [] };

  // Requirement: disallow attaching more than one database (uploaded or live)
  // to the same connected agent.
  const [uploadRes, liveRes] = await Promise.all([
    supabase
      .from('document_database_schemas')
      .select('project_agent_id')
      .eq('organization_id', context.organizationId)
      .eq('is_deleted', false)
      .in('project_agent_id', requested),
    supabase
      .from('database_connections')
      .select('project_agent_id')
      .eq('organization_id', context.organizationId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'connected'])
      .in('project_agent_id', requested),
  ]);

  if (uploadRes.error) return { ok: false, message: uploadRes.error.message, code: 'BAD_REQUEST' };
  if (liveRes.error) return { ok: false, message: liveRes.error.message, code: 'BAD_REQUEST' };

  const blockedPaIds = new Set<string>();
  for (const row of (uploadRes.data ?? []) as Array<{ project_agent_id?: string | null }>) {
    if (row.project_agent_id) blockedPaIds.add(String(row.project_agent_id));
  }
  for (const row of (liveRes.data ?? []) as Array<{ project_agent_id?: string | null }>) {
    if (row.project_agent_id) blockedPaIds.add(String(row.project_agent_id));
  }

  const conflicts: Array<{ projectAgentId: string; agentDisplayName: string }> = requested
    .filter((paId) => blockedPaIds.has(paId))
    .map((paId) => {
      const aid = agentIdByPa.get(paId);
      return {
        projectAgentId: paId,
        agentDisplayName: aid ? displayByAgentId.get(aid) ?? '—' : '—',
      };
    });

  return { ok: true, conflicts };
}

export async function uploadProjectDatabaseFilesForCurrentUser(args: {
  projectId: string;
  databaseTypeId: string;
  databaseId: string;
  databaseName: string;
  databaseExportLayoutId: string;
  projectAgentIds: string[];
  schemaFile: File;
  dataFile: File;
}): Promise<ProjectDatabaseUploadApiResult> {
  const context = await getProjectContextForCurrentUser(args.projectId);
  if (!context.ok) return context;

  const validIdSet = new Set(context.projectAgentRows.map((r) => r.projectAgentId));
  const selectedIds = [...new Set(args.projectAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean))].filter(
    (id) => validIdSet.has(id),
  );
  if (selectedIds.length === 0) {
    return { ok: false, message: 'Select at least one connected agent.', code: 'BAD_REQUEST' };
  }

  const selectedAgents = context.projectAgentRows.filter((r) => selectedIds.includes(r.projectAgentId));
  if (selectedAgents.length === 0) {
    return { ok: false, message: 'No valid connected agents selected.', code: 'BAD_REQUEST' };
  }

  const databaseName = String(args.databaseName ?? '').trim();
  if (!databaseName) return { ok: false, message: 'Database name is required.', code: 'BAD_REQUEST' };

  const databaseExportLayoutId = String(args.databaseExportLayoutId ?? '').trim();
  if (!databaseExportLayoutId) {
    return { ok: false, message: 'Export layout is required.', code: 'BAD_REQUEST' };
  }

  const conflictRes = await checkDatabaseUploadConflictsForCurrentUser(args.projectId, {
    databaseName,
    projectAgentIds: selectedIds,
  });
  if (!conflictRes.ok) return conflictRes;
  if (conflictRes.conflicts.length > 0) {
    return {
      ok: false,
      message:
        `The following agent(s) already have a database attached (uploaded or connected): ${conflictRes.conflicts
          .map((c) => c.agentDisplayName)
          .join(', ')}. Deselect those agents and try again.`,
      code: 'NAME_CONFLICT',
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const { data: layoutRow, error: layoutErr } = await supabase
    .from('database_export_layouts')
    .select('id,format,platform')
    .eq('id', databaseExportLayoutId)
    .eq('is_active', true)
    .maybeSingle();
  if (layoutErr) return { ok: false, message: layoutErr.message, code: 'BAD_REQUEST' };
  if (!layoutRow?.id) {
    return { ok: false, message: 'Invalid or inactive export layout.', code: 'BAD_REQUEST' };
  }

  const layoutFormat = String((layoutRow as { format?: string }).format ?? 'json');
  const layoutPlatform = String((layoutRow as { platform?: string }).platform ?? 'generic');

  const dbId = String(args.databaseId ?? '').trim();
  if (dbId) {
    const { data: dbRow, error: dbCheckErr } = await supabase
      .from('databases')
      .select('id,database_type_id')
      .eq('id', dbId)
      .maybeSingle();
    if (dbCheckErr) return { ok: false, message: dbCheckErr.message, code: 'BAD_REQUEST' };
    if (!dbRow) return { ok: false, message: 'Invalid database selection.', code: 'BAD_REQUEST' };
    const typeId = String(args.databaseTypeId ?? '').trim();
    if (typeId && String((dbRow as { database_type_id?: string }).database_type_id) !== typeId) {
      return { ok: false, message: 'Database does not match the selected database type.', code: 'BAD_REQUEST' };
    }
  }

  const schemaFile = args.schemaFile;
  const dataFile = args.dataFile;
  const schemaName = String(schemaFile.name ?? '').trim();
  const dataName = String(dataFile.name ?? '').trim();
  if (!schemaName) return { ok: false, message: 'Schema file is required.', code: 'BAD_REQUEST' };
  if (!dataName) return { ok: false, message: 'Data file is required.', code: 'BAD_REQUEST' };

  const schemaAllowed = await assertDbFileExtensionAllowed({
    supabase,
    fileName: schemaName,
    purpose: 'db-schema-file',
  });
  if (!schemaAllowed.ok) return { ok: false, message: schemaAllowed.message, code: 'BAD_REQUEST' };

  const dataAllowed = await assertDbFileExtensionAllowed({
    supabase,
    fileName: dataName,
    purpose: 'data-file',
  });
  if (!dataAllowed.ok) return { ok: false, message: dataAllowed.message, code: 'BAD_REQUEST' };

  const { extLowerNoDot: schemaExt } = splitFileNameAndExt(schemaName);
  const { extLowerNoDot: dataExt } = splitFileNameAndExt(dataName);
  if (!schemaExt || !dataExt) {
    return { ok: false, message: 'Invalid file extensions.', code: 'BAD_REQUEST' };
  }

  const { data: schemaPurposeRow, error: purposeErr } = await supabase
    .from('document_db_file_purposes')
    .select('id')
    .eq('file_purpose', 'db-schema-file')
    .maybeSingle();
  if (purposeErr) return { ok: false, message: purposeErr.message, code: 'BAD_REQUEST' };
  if (!schemaPurposeRow?.id) return { ok: false, message: 'Schema purpose not configured.', code: 'BAD_REQUEST' };

  const schemaBytes = Buffer.from(await schemaFile.arrayBuffer());
  const dataBytes = Buffer.from(await dataFile.arrayBuffer());
  const schemaSql = schemaBytes.toString('utf8');

  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(dataBytes.toString('utf8')) as unknown;
  } catch {
    return { ok: false, message: 'Data file must be valid JSON.', code: 'BAD_REQUEST' };
  }

  const extracted = extractDatabaseTablesFromDataJson({
    format: layoutFormat,
    platform: layoutPlatform,
    parsedJson,
    rawDataBytesLength: dataBytes.byteLength,
  });
  if (!extracted.ok) {
    return { ok: false, message: extracted.message, code: 'BAD_REQUEST' };
  }

  const tableRowsForInsert =
    extracted.strategy === 'phpmyadmin'
      ? extracted.tables
      : [
          {
            schemaName: 'public',
            tableName: '__uploaded__',
            tableData: extracted.tableData,
            rowCountEstimate: extracted.rowCountEstimate,
            payloadBytes: extracted.payloadBytes,
          },
        ];

  const uploads: Array<{ schemaDocumentId: string; dataDocumentId: string; schemaId: string }> = [];

  for (const projectAgent of selectedAgents) {
    const schemaDocumentId = crypto.randomUUID();
    const dataDocumentId = crypto.randomUUID();
    const schemaFileName = `${schemaDocumentId}.${schemaExt}`;
    const dataFileName = `${dataDocumentId}.${dataExt}`;

    const schemaPath = buildStoragePath({
      organizationId: context.organizationId,
      projectId: context.projectId,
      agentId: projectAgent.agentId,
      fileName: schemaFileName,
    });
    const dataPath = buildStoragePath({
      organizationId: context.organizationId,
      projectId: context.projectId,
      agentId: projectAgent.agentId,
      fileName: dataFileName,
    });

    const nowIso = new Date().toISOString();

    const { error: docsInsertErr } = await supabase.from('documents').insert([
      {
        id: schemaDocumentId,
        project_agent_id: projectAgent.projectAgentId,
        organization_id: context.organizationId,
        file_name: schemaFileName,
        file_type: 'text/sql',
        file_size_bytes: schemaBytes.byteLength,
        storage_bucket: DATABASE_FILES_STORAGE_BUCKET,
        storage_path: schemaPath,
        status: 'ready',
        chunk_count: 0,
        processed_at: nowIso,
        is_db_schema_file: true,
        is_db_data_file: false,
      },
      {
        id: dataDocumentId,
        project_agent_id: projectAgent.projectAgentId,
        organization_id: context.organizationId,
        file_name: dataFileName,
        file_type: 'application/json',
        file_size_bytes: dataBytes.byteLength,
        storage_bucket: DATABASE_FILES_STORAGE_BUCKET,
        storage_path: dataPath,
        status: 'ready',
        chunk_count: 0,
        processed_at: nowIso,
        is_db_schema_file: false,
        is_db_data_file: true,
      },
    ]);

    if (docsInsertErr) return { ok: false, message: docsInsertErr.message, code: 'BAD_REQUEST' };

    const uploadSchema = await supabase.storage
      .from(DATABASE_FILES_STORAGE_BUCKET)
      .upload(schemaPath, schemaBytes, { contentType: 'text/sql', upsert: false });
    if (uploadSchema.error) {
      return { ok: false, message: uploadSchema.error.message, code: 'BAD_REQUEST' };
    }

    const uploadData = await supabase.storage
      .from(DATABASE_FILES_STORAGE_BUCKET)
      .upload(dataPath, dataBytes, { contentType: 'application/json', upsert: false });
    if (uploadData.error) {
      return { ok: false, message: uploadData.error.message, code: 'BAD_REQUEST' };
    }

    const { data: schemaRows, error: schemaInsertErr } = await supabase
      .from('document_database_schemas')
      .insert({
        organization_id: context.organizationId,
        project_agent_id: projectAgent.projectAgentId,
        document_id: schemaDocumentId,
        source_type_id: schemaPurposeRow.id,
        database_id: dbId || null,
        database_export_layout_id: databaseExportLayoutId,
        database_name: databaseName,
        schema_sql: schemaSql,
        status: 'ready',
        table_count: 0,
      })
      .select('id')
      .maybeSingle();

    if (schemaInsertErr) return { ok: false, message: schemaInsertErr.message, code: 'BAD_REQUEST' };
    const schemaId = schemaRows?.id as string | undefined;
    if (!schemaId) return { ok: false, message: 'Schema insert failed.', code: 'BAD_REQUEST' };

    const rep = await replaceSchemaTableDataRows(supabase, {
      schemaId,
      organizationId: context.organizationId,
      projectAgentId: projectAgent.projectAgentId,
      dataDocumentId,
      tables: tableRowsForInsert,
    });
    if (!rep.ok) return { ok: false, message: rep.message, code: 'BAD_REQUEST' };

    uploads.push({ schemaDocumentId, dataDocumentId, schemaId });
  }

  return { ok: true, uploads };
}

export async function renameDatabaseSchemaForCurrentUser(
  projectId: string,
  schemaId: string,
  payload: { databaseName: string },
): Promise<ProjectDatabaseRenameApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const sid = String(schemaId ?? '').trim();
  if (!sid) return { ok: false, message: 'Missing schema id.', code: 'BAD_REQUEST' };

  const newName = String(payload.databaseName ?? '').trim();
  if (!newName) return { ok: false, message: 'Database name is required.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: false, message: 'No connected agents for this project.', code: 'NOT_FOUND' };
  }

  const { data: row, error: loadErr } = await supabase
    .from('document_database_schemas')
    .select('id,project_agent_id,database_name')
    .eq('id', sid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!row) return { ok: false, message: 'Database not found.', code: 'NOT_FOUND' };

  const paId = String((row as { project_agent_id: string }).project_agent_id);

  const { data: dup, error: dupErr } = await supabase
    .from('document_database_schemas')
    .select('id')
    .eq('project_agent_id', paId)
    .eq('database_name', newName)
    .eq('is_deleted', false)
    .neq('id', sid)
    .maybeSingle();

  if (dupErr) return { ok: false, message: dupErr.message, code: 'BAD_REQUEST' };
  if (dup?.id) {
    return {
      ok: false,
      message: 'A database with this name already exists for this agent.',
      code: 'DUPLICATE_NAME',
    };
  }

  const { error: updErr } = await supabase
    .from('document_database_schemas')
    .update({ database_name: newName, updated_at: new Date().toISOString() })
    .eq('id', sid);

  if (updErr) return { ok: false, message: updErr.message, code: 'BAD_REQUEST' };

  return { ok: true, schemaId: sid, databaseName: newName };
}

export async function updateDatabaseSchemaFilesForCurrentUser(
  projectId: string,
  schemaId: string,
  payload: { schemaFile: File; dataFile: File },
): Promise<ProjectDatabaseUpdateFilesApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const sid = String(schemaId ?? '').trim();
  if (!sid) return { ok: false, message: 'Missing schema id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: schemaRow, error: sErr } = await supabase
    .from('document_database_schemas')
    .select('id,project_agent_id,document_id,database_export_layout_id')
    .eq('id', sid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (sErr) return { ok: false, message: sErr.message, code: 'BAD_REQUEST' };
  if (!schemaRow) return { ok: false, message: 'Database not found.', code: 'NOT_FOUND' };

  const schemaDocId = String((schemaRow as { document_id: string }).document_id);
  const projectAgentIdForSchema = String((schemaRow as { project_agent_id: string }).project_agent_id);
  const layoutRes = await loadExportLayoutFormatPlatformForSchema(
    supabase,
    (schemaRow as { database_export_layout_id?: string | null }).database_export_layout_id,
  );
  if (!layoutRes.ok) return { ok: false, message: layoutRes.message, code: 'BAD_REQUEST' };

  const { data: tdRow, error: tdErr } = await supabase
    .from('document_database_table_data')
    .select('document_id')
    .eq('schema_id', sid)
    .limit(1)
    .maybeSingle();

  if (tdErr) return { ok: false, message: tdErr.message, code: 'BAD_REQUEST' };
  if (!tdRow?.document_id) {
    return { ok: false, message: 'Data document not found for this database.', code: 'BAD_REQUEST' };
  }
  const dataDocId = String((tdRow as { document_id: string }).document_id);

  const schemaFile = payload.schemaFile;
  const dataFile = payload.dataFile;
  const schemaName = String(schemaFile.name ?? '').trim();
  const dataName = String(dataFile.name ?? '').trim();

  const schemaAllowed = await assertDbFileExtensionAllowed({ supabase, fileName: schemaName, purpose: 'db-schema-file' });
  if (!schemaAllowed.ok) return { ok: false, message: schemaAllowed.message, code: 'BAD_REQUEST' };
  const dataAllowed = await assertDbFileExtensionAllowed({ supabase, fileName: dataName, purpose: 'data-file' });
  if (!dataAllowed.ok) return { ok: false, message: dataAllowed.message, code: 'BAD_REQUEST' };

  const { data: docRows, error: docErr } = await supabase
    .from('documents')
    .select('id,storage_path,storage_bucket')
    .in('id', [schemaDocId, dataDocId])
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false);

  if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };
  const paths = new Map<string, { bucket: string; path: string }>();
  for (const d of (docRows ?? []) as Array<{ id: string; storage_bucket: string; storage_path: string }>) {
    paths.set(d.id, { bucket: d.storage_bucket, path: d.storage_path });
  }
  const sp = paths.get(schemaDocId);
  const dp = paths.get(dataDocId);
  if (!sp?.path || !dp?.path || sp.bucket !== DATABASE_FILES_STORAGE_BUCKET || dp.bucket !== DATABASE_FILES_STORAGE_BUCKET) {
    return { ok: false, message: 'Invalid storage paths for database files.', code: 'BAD_REQUEST' };
  }

  const schemaBytes = Buffer.from(await schemaFile.arrayBuffer());
  const dataBytes = Buffer.from(await dataFile.arrayBuffer());
  const schemaSql = schemaBytes.toString('utf8');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(dataBytes.toString('utf8')) as unknown;
  } catch {
    return { ok: false, message: 'Data file must be valid JSON.', code: 'BAD_REQUEST' };
  }

  const extracted = extractDatabaseTablesFromDataJson({
    format: layoutRes.format,
    platform: layoutRes.platform,
    parsedJson,
    rawDataBytesLength: dataBytes.byteLength,
  });
  if (!extracted.ok) {
    return { ok: false, message: extracted.message, code: 'BAD_REQUEST' };
  }

  const tableRowsForInsert =
    extracted.strategy === 'phpmyadmin'
      ? extracted.tables
      : [
          {
            schemaName: 'public',
            tableName: '__uploaded__',
            tableData: extracted.tableData,
            rowCountEstimate: extracted.rowCountEstimate,
            payloadBytes: extracted.payloadBytes,
          },
        ];

  const upSchema = await supabase.storage
    .from(DATABASE_FILES_STORAGE_BUCKET)
    .upload(sp.path, schemaBytes, { contentType: 'text/sql', upsert: true });
  if (upSchema.error) return { ok: false, message: upSchema.error.message, code: 'BAD_REQUEST' };

  const upData = await supabase.storage
    .from(DATABASE_FILES_STORAGE_BUCKET)
    .upload(dp.path, dataBytes, { contentType: 'application/json', upsert: true });
  if (upData.error) return { ok: false, message: upData.error.message, code: 'BAD_REQUEST' };

  const nowIso = new Date().toISOString();

  const { error: d1 } = await supabase
    .from('documents')
    .update({
      file_size_bytes: schemaBytes.byteLength,
      file_type: 'text/sql',
      processed_at: nowIso,
    })
    .eq('id', schemaDocId);

  if (d1) return { ok: false, message: d1.message, code: 'BAD_REQUEST' };

  const { error: d2 } = await supabase
    .from('documents')
    .update({
      file_size_bytes: dataBytes.byteLength,
      file_type: 'application/json',
      processed_at: nowIso,
    })
    .eq('id', dataDocId);

  if (d2) return { ok: false, message: d2.message, code: 'BAD_REQUEST' };

  const { error: us } = await supabase
    .from('document_database_schemas')
    .update({ schema_sql: schemaSql, updated_at: nowIso })
    .eq('id', sid);

  if (us) return { ok: false, message: us.message, code: 'BAD_REQUEST' };

  const rep = await replaceSchemaTableDataRows(supabase, {
    schemaId: sid,
    organizationId: context.organizationId,
    projectAgentId: projectAgentIdForSchema,
    dataDocumentId: dataDocId,
    tables: tableRowsForInsert,
  });
  if (!rep.ok) return { ok: false, message: rep.message, code: 'BAD_REQUEST' };

  return { ok: true, schemaId: sid };
}

export async function updateDatabaseSchemaDataFileForCurrentUser(
  projectId: string,
  schemaId: string,
  payload: { dataFile: File },
): Promise<ProjectDatabaseUpdateDataFileApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const sid = String(schemaId ?? '').trim();
  if (!sid) return { ok: false, message: 'Missing schema id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: schemaRow, error: sErr } = await supabase
    .from('document_database_schemas')
    .select('id,project_agent_id,document_id,database_export_layout_id')
    .eq('id', sid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (sErr) return { ok: false, message: sErr.message, code: 'BAD_REQUEST' };
  if (!schemaRow) return { ok: false, message: 'Database not found.', code: 'NOT_FOUND' };

  const projectAgentIdForSchema = String((schemaRow as { project_agent_id: string }).project_agent_id);
  const layoutRes = await loadExportLayoutFormatPlatformForSchema(
    supabase,
    (schemaRow as { database_export_layout_id?: string | null }).database_export_layout_id,
  );
  if (!layoutRes.ok) return { ok: false, message: layoutRes.message, code: 'BAD_REQUEST' };

  const { data: tdRow, error: tdErr } = await supabase
    .from('document_database_table_data')
    .select('document_id')
    .eq('schema_id', sid)
    .limit(1)
    .maybeSingle();

  if (tdErr) return { ok: false, message: tdErr.message, code: 'BAD_REQUEST' };
  if (!tdRow?.document_id) {
    return { ok: false, message: 'Data document not found for this database.', code: 'BAD_REQUEST' };
  }
  const dataDocId = String((tdRow as { document_id: string }).document_id);

  const dataFile = payload.dataFile;
  const dataName = String(dataFile.name ?? '').trim();
  const dataAllowed = await assertDbFileExtensionAllowed({ supabase, fileName: dataName, purpose: 'data-file' });
  if (!dataAllowed.ok) return { ok: false, message: dataAllowed.message, code: 'BAD_REQUEST' };

  const { data: docRows, error: docErr } = await supabase
    .from('documents')
    .select('id,storage_path,storage_bucket,file_name')
    .eq('id', dataDocId)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };
  const doc = docRows as
    | { id: string; storage_bucket: string; storage_path: string; file_name: string | null }
    | null;
  if (!doc?.storage_path || doc.storage_bucket !== DATABASE_FILES_STORAGE_BUCKET) {
    return { ok: false, message: 'Invalid storage path for data file.', code: 'BAD_REQUEST' };
  }

  const dataBytes = Buffer.from(await dataFile.arrayBuffer());

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(dataBytes.toString('utf8')) as unknown;
  } catch {
    return { ok: false, message: 'Data file must be valid JSON.', code: 'BAD_REQUEST' };
  }

  const extracted = extractDatabaseTablesFromDataJson({
    format: layoutRes.format,
    platform: layoutRes.platform,
    parsedJson,
    rawDataBytesLength: dataBytes.byteLength,
  });
  if (!extracted.ok) {
    return { ok: false, message: extracted.message, code: 'BAD_REQUEST' };
  }

  const tableRowsForInsert =
    extracted.strategy === 'phpmyadmin'
      ? extracted.tables
      : [
          {
            schemaName: 'public',
            tableName: '__uploaded__',
            tableData: extracted.tableData,
            rowCountEstimate: extracted.rowCountEstimate,
            payloadBytes: extracted.payloadBytes,
          },
        ];

  const upData = await supabase.storage
    .from(DATABASE_FILES_STORAGE_BUCKET)
    .upload(doc.storage_path, dataBytes, { contentType: 'application/json', upsert: true });
  if (upData.error) return { ok: false, message: upData.error.message, code: 'BAD_REQUEST' };

  const nowIso = new Date().toISOString();
  const { extLowerNoDot: dataExt } = splitFileNameAndExt(dataName);
  if (!dataExt) {
    return { ok: false, message: 'Data file must have an extension.', code: 'BAD_REQUEST' };
  }
  const storedFileName = `${dataDocId}.${dataExt}`;

  const { error: d2 } = await supabase
    .from('documents')
    .update({
      file_name: storedFileName,
      file_size_bytes: dataBytes.byteLength,
      file_type: 'application/json',
      processed_at: nowIso,
    })
    .eq('id', dataDocId);

  if (d2) return { ok: false, message: d2.message, code: 'BAD_REQUEST' };

  const rep = await replaceSchemaTableDataRows(supabase, {
    schemaId: sid,
    organizationId: context.organizationId,
    projectAgentId: projectAgentIdForSchema,
    dataDocumentId: dataDocId,
    tables: tableRowsForInsert,
  });
  if (!rep.ok) return { ok: false, message: rep.message, code: 'BAD_REQUEST' };

  return { ok: true, schemaId: sid };
}

function safeZipDownloadSegment(s: string): string {
  const t = String(s ?? '').trim();
  if (!t) return 'item';
  return t.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
}

export async function downloadDatabaseSchemaZipForCurrentUser(
  projectId: string,
  schemaId: string,
): Promise<ProjectDatabaseDownloadZipApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const sid = String(schemaId ?? '').trim();
  if (!sid) return { ok: false, message: 'Missing schema id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: schemaRow, error: sErr } = await supabase
    .from('document_database_schemas')
    .select('id,project_agent_id,document_id')
    .eq('id', sid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (sErr) return { ok: false, message: sErr.message, code: 'BAD_REQUEST' };
  if (!schemaRow) return { ok: false, message: 'Database not found.', code: 'NOT_FOUND' };

  const schemaDocId = String((schemaRow as { document_id: string }).document_id);
  const paId = String((schemaRow as { project_agent_id: string }).project_agent_id);

  const { data: tdRow, error: tdErr } = await supabase
    .from('document_database_table_data')
    .select('id,document_id')
    .eq('schema_id', sid)
    .limit(1)
    .maybeSingle();

  if (tdErr) return { ok: false, message: tdErr.message, code: 'BAD_REQUEST' };
  if (!tdRow?.document_id) {
    return { ok: false, message: 'Data document not found for this database.', code: 'BAD_REQUEST' };
  }
  const dataDocId = String((tdRow as { document_id: string }).document_id);

  const { data: projectRow, error: pErr } = await supabase
    .from('projects')
    .select('title')
    .eq('id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (pErr) return { ok: false, message: pErr.message, code: 'BAD_REQUEST' };
  const projectName = String((projectRow as { title?: string | null } | null)?.title ?? 'project');

  const agentId = context.projectAgentRows.find((r) => r.projectAgentId === paId)?.agentId;
  let agentName = 'agent';
  if (agentId) {
    const { data: ag, error: agErr } = await supabase
      .from('agents')
      .select('display_name')
      .eq('id', agentId)
      .maybeSingle();
    if (!agErr && ag) {
      agentName = String((ag as { display_name?: string | null }).display_name ?? agentName);
    }
  }

  const { data: storDocs, error: docErr } = await supabase
    .from('documents')
    .select('id,storage_path,storage_bucket,file_name')
    .in('id', [schemaDocId, dataDocId])
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false);

  if (docErr) return { ok: false, message: docErr.message, code: 'BAD_REQUEST' };

  const byId = new Map<string, { storage_path: string; file_name: string | null }>();
  for (const d of (storDocs ?? []) as Array<{
    id: string;
    storage_path: string;
    storage_bucket: string;
    file_name: string | null;
  }>) {
    if (d.storage_bucket === DATABASE_FILES_STORAGE_BUCKET && d.storage_path) {
      byId.set(d.id, { storage_path: d.storage_path, file_name: d.file_name });
    }
  }

  const sMeta = byId.get(schemaDocId);
  const dMeta = byId.get(dataDocId);
  if (!sMeta || !dMeta) {
    return { ok: false, message: 'Could not load database file metadata.', code: 'BAD_REQUEST' };
  }

  const [schemaDl, dataDl] = await Promise.all([
    supabase.storage.from(DATABASE_FILES_STORAGE_BUCKET).download(sMeta.storage_path),
    supabase.storage.from(DATABASE_FILES_STORAGE_BUCKET).download(dMeta.storage_path),
  ]);

  if (schemaDl.error) return { ok: false, message: schemaDl.error.message, code: 'BAD_REQUEST' };
  if (dataDl.error) return { ok: false, message: dataDl.error.message, code: 'BAD_REQUEST' };

  const schemaBuf = Buffer.from(await schemaDl.data.arrayBuffer());
  const dataBuf = Buffer.from(await dataDl.data.arrayBuffer());

  const zip = new JSZip();
  const schemaEntryName = sMeta.file_name?.trim() || 'schema.sql';
  const dataEntryName = dMeta.file_name?.trim() || 'data.json';
  zip.file(schemaEntryName, schemaBuf);
  zip.file(dataEntryName, dataBuf);

  const body = await zip.generateAsync({ type: 'nodebuffer' });
  const fileName = `${safeZipDownloadSegment(projectName)}_${safeZipDownloadSegment(agentName)}.zip`;

  return { ok: true, body, fileName };
}

export async function deleteDatabaseSchemaForCurrentUser(
  projectId: string,
  schemaId: string,
): Promise<ProjectDatabaseDeleteApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const sid = String(schemaId ?? '').trim();
  if (!sid) return { ok: false, message: 'Missing schema id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: schemaRow, error: sErr } = await supabase
    .from('document_database_schemas')
    .select('id,document_id')
    .eq('id', sid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (sErr) return { ok: false, message: sErr.message, code: 'BAD_REQUEST' };
  if (!schemaRow) return { ok: false, message: 'Database not found.', code: 'NOT_FOUND' };

  const schemaDocId = String((schemaRow as { document_id: string }).document_id);

  const { data: tdRows, error: tdErr } = await supabase
    .from('document_database_table_data')
    .select('document_id')
    .eq('schema_id', sid);

  if (tdErr) return { ok: false, message: tdErr.message, code: 'BAD_REQUEST' };

  const dataDocIds = [...new Set((tdRows ?? []).map((r: { document_id: string }) => r.document_id))];

  const allIds = [schemaDocId, ...dataDocIds];
  const { data: storDocs, error: stErr } = await supabase
    .from('documents')
    .select('id,storage_bucket,storage_path')
    .in('id', allIds)
    .eq('organization_id', context.organizationId);

  if (stErr) return { ok: false, message: stErr.message, code: 'BAD_REQUEST' };

  for (const doc of (storDocs ?? []) as Array<{
    storage_bucket: string;
    storage_path: string;
  }>) {
    if (doc.storage_bucket === DATABASE_FILES_STORAGE_BUCKET && doc.storage_path) {
      const moved = await moveDatabaseObjectFromStorageToDumpBucket(supabase, doc.storage_path);
      if (!moved.ok) return { ok: false, message: moved.message, code: 'BAD_REQUEST' };
    }
  }

  const nowIso = new Date().toISOString();

  const { error: docUpdErr } = await supabase
    .from('documents')
    .update({
      storage_bucket: DATABASE_FILES_DUMP_BUCKET,
      is_deleted: true,
      updated_at: nowIso,
    })
    .in('id', allIds)
    .eq('organization_id', context.organizationId);

  if (docUpdErr) return { ok: false, message: docUpdErr.message, code: 'BAD_REQUEST' };

  const { error: delTdErr } = await supabase.from('document_database_table_data').delete().eq('schema_id', sid);
  if (delTdErr) return { ok: false, message: delTdErr.message, code: 'BAD_REQUEST' };

  const { error: schemaUpdErr } = await supabase
    .from('document_database_schemas')
    .update({ is_deleted: true, updated_at: nowIso })
    .eq('id', sid)
    .eq('organization_id', context.organizationId);

  if (schemaUpdErr) return { ok: false, message: schemaUpdErr.message, code: 'BAD_REQUEST' };

  return { ok: true, schemaId: sid };
}

