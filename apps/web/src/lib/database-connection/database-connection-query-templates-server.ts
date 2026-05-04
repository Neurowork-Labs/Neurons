/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getProjectContextForCurrentUser } from '@/lib/storage/storage-server-helpers';
import { validateMongoQueryTemplateBody } from '@/lib/project-database/mongo-query-template-validation';
import { validateCardConfig } from '@/lib/project-database/query-template-card-config';
import { queryTemplateDialectFromDatabaseTypeName } from '@/lib/project-database/query-template-dialect';
import type {
  QueryTemplateCardConfig,
  ProjectDatabaseConnectionHeaderForTemplates,
  ProjectDatabaseConnectionQueryModeGetApiResult,
  ProjectDatabaseConnectionQueryModeUpdateApiResult,
  ProjectDatabaseConnectionQueryTemplate,
  ProjectDatabaseConnectionQueryTemplateCreateApiResult,
  ProjectDatabaseConnectionQueryTemplateDeleteApiResult,
  ProjectDatabaseConnectionQueryTemplateUpdateApiResult,
  ProjectDatabaseConnectionQueryTemplatesApiResult,
  QueryTemplateKind,
} from '@/lib/project-database/project-database-types';

type QueryMode = 'generated' | 'template_preferred' | 'template_only';

function isQueryMode(value: string): value is QueryMode {
  return value === 'generated' || value === 'template_preferred' || value === 'template_only';
}

function isTemporarilyAllowedQueryModeForUpdate(value: string): value is 'template_only' {
  return value === 'template_only';
}

function isAllowedReadOnlySql(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(sql);
}

function sqlTextEndsWithSemicolon(sql: string): boolean {
  const t = sql.trim();
  return t.length > 0 && t.endsWith(';');
}

function validateTemplateParameterSchema(
  parameterSchema: Record<string, unknown> | null | undefined,
): string | null {
  if (parameterSchema == null) return null;
  if (typeof parameterSchema !== 'object' || Array.isArray(parameterSchema)) {
    return 'Parameter schema must be a JSON object.';
  }
  const params = (parameterSchema as { parameters?: unknown }).parameters;
  if (params == null) return null;
  if (!Array.isArray(params)) return 'Parameter schema "parameters" must be an array.';
  for (const p of params) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const obj = p as Record<string, unknown>;
    const name = String(obj.name ?? '').trim();
    if (!name) continue;
    if (name.toLowerCase() === 'limit') {
      if (!Object.prototype.hasOwnProperty.call(obj, 'default')) {
        return 'Parameter "limit" default is required and must be an integer between 1 and 50.';
      }
      const raw = obj.default;
      if (raw == null) {
        return 'Parameter "limit" default cannot be null. Use an integer between 1 and 50.';
      }
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return 'Parameter "limit" default must be an integer between 1 and 50.';
      }
    }
    const enumRaw = obj.enum;
    if (enumRaw == null) continue;
    if (!Array.isArray(enumRaw)) {
      return `Parameter "${name}" enum must be an array.`;
    }
    const enumKeys = new Set(enumRaw.map((v) => JSON.stringify(v)));
    if (enumKeys.size !== enumRaw.length) {
      return `Parameter "${name}" enum must not contain duplicate values.`;
    }
    if (!Object.prototype.hasOwnProperty.call(obj, 'default')) {
      return `Parameter "${name}" default is required when enum is provided.`;
    }
    const defKey = JSON.stringify(obj.default);
    if (!enumKeys.has(defKey)) {
      return `Parameter "${name}" default must be one of enum values.`;
    }
  }
  return null;
}

async function assertOrgAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return false;
  const role = String((data as { role?: string }).role ?? '');
  return role === 'owner' || role === 'admin';
}

async function loadConnectionForProject(
  projectId: string,
  connectionId: string,
): Promise<
  | { ok: true; organizationId: string; connectionId: string; queryMode: QueryMode }
  | { ok: false; message: string; code?: string }
> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };
  }

  const { data: conn, error: connErr } = await supabase
    .from('database_connections')
    .select('id,query_mode')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();
  if (connErr) return { ok: false, message: connErr.message, code: 'BAD_REQUEST' };
  if (!conn) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const queryModeRaw = String((conn as { query_mode?: string | null }).query_mode ?? 'template_only');
  return {
    ok: true,
    organizationId: context.organizationId,
    connectionId: String((conn as { id?: string }).id ?? cid),
    queryMode: isQueryMode(queryModeRaw) ? queryModeRaw : 'template_only',
  };
}

function mapQueryKind(raw: unknown): QueryTemplateKind {
  return String(raw ?? '').trim() === 'mongo_json' ? 'mongo_json' : 'sql';
}

function mapCardConfig(raw: unknown): QueryTemplateCardConfig | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.carouselEnabled !== 'boolean') return null;
  return raw as QueryTemplateCardConfig;
}

function mapTemplateRow(row: Record<string, unknown>): ProjectDatabaseConnectionQueryTemplate {
  const kind = mapQueryKind(row.query_kind);
  const qb = row.query_body;
  const queryBody =
    qb != null && typeof qb === 'object' && !Array.isArray(qb)
      ? (qb as Record<string, unknown>)
      : null;
  return {
    id: String(row.id ?? ''),
    connectionId: String(row.connection_id ?? ''),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    sqlText: String(row.sql_text ?? ''),
    queryBody: kind === 'mongo_json' ? queryBody : null,
    queryKind: kind,
    parameterSchema: (row.parameter_schema as Record<string, unknown> | null | undefined) ?? null,
    cardConfig: mapCardConfig(row.card_config),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

async function loadConnectionHeaderForProject(
  projectId: string,
  connectionId: string,
): Promise<
  | {
      ok: true;
      organizationId: string;
      connectionId: string;
      queryMode: QueryMode;
      connection: ProjectDatabaseConnectionHeaderForTemplates;
    }
  | { ok: false; message: string; code?: string }
> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };
  }

  const { data: conn, error: connErr } = await supabase
    .from('database_connections')
    .select('id,display_name,status,query_mode,database_id,project_agent_id')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();
  if (connErr) return { ok: false, message: connErr.message, code: 'BAD_REQUEST' };
  if (!conn) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const paRow = context.projectAgentRows.find(
    (r) => r.projectAgentId === String((conn as { project_agent_id?: string }).project_agent_id ?? ''),
  );
  if (!paRow) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const { data: agentRow } = await supabase
    .from('agents')
    .select('display_name')
    .eq('id', paRow.agentId)
    .maybeSingle();
  const agentDisplayName = String((agentRow as { display_name?: string | null } | null)?.display_name ?? '—');

  const databaseId = (conn as { database_id?: string | null }).database_id;
  let databaseProductName: string | null = null;
  let databaseTypeName: string | null = null;
  let projectDomain: string | null = null;
  if (databaseId) {
    const { data: dbRow, error: dbErr } = await supabase
      .from('databases')
      .select('name, database_types(name)')
      .eq('id', databaseId)
      .maybeSingle();
    if (!dbErr && dbRow) {
      databaseProductName = String((dbRow as { name?: string }).name ?? '');
      const dt = (dbRow as { database_types?: { name?: string | null } | null }).database_types;
      databaseTypeName = dt?.name != null ? String(dt.name) : null;
    }
  }
  const { data: projectRow } = await supabase
    .from('projects')
    .select('domain')
    .eq('id', context.projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  projectDomain = String((projectRow as { domain?: string | null } | null)?.domain ?? '').trim() || null;

  const queryModeRaw = String((conn as { query_mode?: string | null }).query_mode ?? 'template_only');
  const queryMode: QueryMode = isQueryMode(queryModeRaw) ? queryModeRaw : 'template_only';

  const connection: ProjectDatabaseConnectionHeaderForTemplates = {
    id: String((conn as { id?: string }).id ?? cid),
    displayName: String((conn as { display_name?: string | null }).display_name ?? ''),
    projectDomain,
    agentDisplayName,
    databaseProductName,
    databaseTypeName,
    status: String((conn as { status?: string | null }).status ?? ''),
    queryTemplateDialect: queryTemplateDialectFromDatabaseTypeName(databaseTypeName),
  };

  return {
    ok: true,
    organizationId: context.organizationId,
    connectionId: connection.id,
    queryMode,
    connection,
  };
}

function templateSearchHaystack(t: ProjectDatabaseConnectionQueryTemplate): string {
  if (t.queryKind === 'mongo_json' && t.queryBody) {
    try {
      return `${t.name}\n${t.description}\n${JSON.stringify(t.queryBody)}`;
    } catch {
      return `${t.name}\n${t.description}`;
    }
  }
  return `${t.name}\n${t.description}\n${t.sqlText}`;
}

function filterTemplatesBySearchAndStatus(
  templates: ProjectDatabaseConnectionQueryTemplate[],
  searchRaw: string,
  statusFilter: 'all' | 'active' | 'inactive',
): ProjectDatabaseConnectionQueryTemplate[] {
  let out = templates;
  const q = searchRaw.trim().toLowerCase();
  if (q) {
    out = out.filter((t) => templateSearchHaystack(t).toLowerCase().includes(q));
  }
  if (statusFilter === 'active') out = out.filter((t) => t.isActive);
  if (statusFilter === 'inactive') out = out.filter((t) => !t.isActive);
  return out;
}

export async function getConnectionQueryModeForCurrentUser(
  projectId: string,
  connectionId: string,
): Promise<ProjectDatabaseConnectionQueryModeGetApiResult> {
  const loaded = await loadConnectionForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;
  return { ok: true, queryMode: loaded.queryMode };
}

export async function listConnectionQueryTemplatesForCurrentUser(
  projectId: string,
  connectionId: string,
  options?: { search?: string; statusFilter?: 'all' | 'active' | 'inactive' },
): Promise<ProjectDatabaseConnectionQueryTemplatesApiResult> {
  const loaded = await loadConnectionHeaderForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('database_connection_query_templates')
    .select(
      'id,connection_id,name,description,sql_text,query_kind,query_body,parameter_schema,card_config,is_active,sort_order,created_at,updated_at',
    )
    .eq('organization_id', loaded.organizationId)
    .eq('connection_id', loaded.connectionId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };

  const all = ((data ?? []) as Array<Record<string, unknown>>).map(mapTemplateRow);
  const statusFilter = options?.statusFilter ?? 'all';
  const search = options?.search ?? '';
  const templates = filterTemplatesBySearchAndStatus(all, search, statusFilter);

  return {
    ok: true,
    connection: loaded.connection,
    queryMode: loaded.queryMode,
    templates,
  };
}

export async function createConnectionQueryTemplateForCurrentUser(
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
  const loaded = await loadConnectionHeaderForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };
  const isAdmin = await assertOrgAdmin(supabase, loaded.organizationId, authRow.user.id);
  if (!isAdmin) return { ok: false, message: 'Only organization admins can manage query templates.', code: 'FORBIDDEN' };

  const name = String(payload.name ?? '').trim();
  const description = String(payload.description ?? '').trim();
  if (!name || !description) {
    return { ok: false, message: 'Name and description are required.', code: 'BAD_REQUEST' };
  }
  const schemaErr = validateTemplateParameterSchema(payload.parameterSchema);
  if (schemaErr) return { ok: false, message: schemaErr, code: 'BAD_REQUEST' };

  const cardConfigErr = validateCardConfig(payload.cardConfig);
  if (cardConfigErr) return { ok: false, message: cardConfigErr, code: 'BAD_REQUEST' };

  const dialect = loaded.connection.queryTemplateDialect;
  let insertRow: Record<string, unknown>;

  if (dialect === 'sql') {
    const sqlText = String(payload.sqlText ?? '').trim();
    if (!sqlText) {
      return { ok: false, message: 'Name, description and SQL query are required.', code: 'BAD_REQUEST' };
    }
    if (!sqlTextEndsWithSemicolon(sqlText)) {
      return { ok: false, message: 'SQL query must end with a semicolon (;).', code: 'BAD_REQUEST' };
    }
    if (!isAllowedReadOnlySql(sqlText)) {
      return { ok: false, message: 'Only read-only SELECT or WITH SQL queries are allowed.', code: 'BAD_REQUEST' };
    }
    insertRow = {
      organization_id: loaded.organizationId,
      connection_id: loaded.connectionId,
      name,
      description,
      query_kind: 'sql',
      sql_text: sqlText,
      query_body: null,
      parameter_schema: payload.parameterSchema ?? null,
      card_config: payload.cardConfig ?? null,
      is_active: payload.isActive ?? true,
      sort_order: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
      is_deleted: false,
    };
  } else {
    const body = payload.queryBody;
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, message: 'Query document (JSON object) is required.', code: 'BAD_REQUEST' };
    }
    const mongoErr = validateMongoQueryTemplateBody(body);
    if (mongoErr) return { ok: false, message: mongoErr, code: 'BAD_REQUEST' };
    insertRow = {
      organization_id: loaded.organizationId,
      connection_id: loaded.connectionId,
      name,
      description,
      query_kind: 'mongo_json',
      sql_text: '',
      query_body: body,
      parameter_schema: payload.parameterSchema ?? null,
      card_config: payload.cardConfig ?? null,
      is_active: payload.isActive ?? true,
      sort_order: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
      is_deleted: false,
    };
  }

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('database_connection_query_templates')
    .insert(insertRow)
    .select(
      'id,connection_id,name,description,sql_text,query_kind,query_body,parameter_schema,card_config,is_active,sort_order,created_at,updated_at',
    )
    .single();
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };

  return { ok: true, template: mapTemplateRow((data ?? {}) as Record<string, unknown>) };
}

export async function updateConnectionQueryTemplateForCurrentUser(
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
  const loaded = await loadConnectionHeaderForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };
  const isAdmin = await assertOrgAdmin(supabase, loaded.organizationId, authRow.user.id);
  if (!isAdmin) return { ok: false, message: 'Only organization admins can manage query templates.', code: 'FORBIDDEN' };

  const tid = String(templateId ?? '').trim();
  if (!tid) return { ok: false, message: 'Missing template id.', code: 'BAD_REQUEST' };

  const name = String(payload.name ?? '').trim();
  const description = String(payload.description ?? '').trim();
  if (!name || !description) {
    return { ok: false, message: 'Name and description are required.', code: 'BAD_REQUEST' };
  }
  const schemaErr = validateTemplateParameterSchema(payload.parameterSchema);
  if (schemaErr) return { ok: false, message: schemaErr, code: 'BAD_REQUEST' };

  const cardConfigErr = validateCardConfig(payload.cardConfig);
  if (cardConfigErr) return { ok: false, message: cardConfigErr, code: 'BAD_REQUEST' };

  const dialect = loaded.connection.queryTemplateDialect;
  let updateRow: Record<string, unknown>;

  if (dialect === 'sql') {
    const sqlText = String(payload.sqlText ?? '').trim();
    if (!sqlText) {
      return { ok: false, message: 'Name, description and SQL query are required.', code: 'BAD_REQUEST' };
    }
    if (!sqlTextEndsWithSemicolon(sqlText)) {
      return { ok: false, message: 'SQL query must end with a semicolon (;).', code: 'BAD_REQUEST' };
    }
    if (!isAllowedReadOnlySql(sqlText)) {
      return { ok: false, message: 'Only read-only SELECT or WITH SQL queries are allowed.', code: 'BAD_REQUEST' };
    }
    updateRow = {
      name,
      description,
      query_kind: 'sql',
      sql_text: sqlText,
      query_body: null,
      parameter_schema: payload.parameterSchema ?? null,
      card_config: payload.cardConfig ?? null,
      is_active: payload.isActive ?? true,
      sort_order: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
    };
  } else {
    const body = payload.queryBody;
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, message: 'Query document (JSON object) is required.', code: 'BAD_REQUEST' };
    }
    const mongoErr = validateMongoQueryTemplateBody(body);
    if (mongoErr) return { ok: false, message: mongoErr, code: 'BAD_REQUEST' };
    updateRow = {
      name,
      description,
      query_kind: 'mongo_json',
      sql_text: '',
      query_body: body,
      parameter_schema: payload.parameterSchema ?? null,
      card_config: payload.cardConfig ?? null,
      is_active: payload.isActive ?? true,
      sort_order: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
    };
  }

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('database_connection_query_templates')
    .update(updateRow)
    .eq('id', tid)
    .eq('organization_id', loaded.organizationId)
    .eq('connection_id', loaded.connectionId)
    .eq('is_deleted', false)
    .select(
      'id,connection_id,name,description,sql_text,query_kind,query_body,parameter_schema,card_config,is_active,sort_order,created_at,updated_at',
    )
    .maybeSingle();
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };
  if (!data) return { ok: false, message: 'Query template not found.', code: 'NOT_FOUND' };

  return { ok: true, template: mapTemplateRow(data as Record<string, unknown>) };
}

export async function deleteConnectionQueryTemplateForCurrentUser(
  projectId: string,
  connectionId: string,
  templateId: string,
): Promise<ProjectDatabaseConnectionQueryTemplateDeleteApiResult> {
  const loaded = await loadConnectionForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };
  const isAdmin = await assertOrgAdmin(supabase, loaded.organizationId, authRow.user.id);
  if (!isAdmin) return { ok: false, message: 'Only organization admins can manage query templates.', code: 'FORBIDDEN' };

  const tid = String(templateId ?? '').trim();
  if (!tid) return { ok: false, message: 'Missing template id.', code: 'BAD_REQUEST' };

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('database_connection_query_templates')
    .update({ is_deleted: true, is_active: false })
    .eq('id', tid)
    .eq('organization_id', loaded.organizationId)
    .eq('connection_id', loaded.connectionId)
    .eq('is_deleted', false)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };
  if (!data) return { ok: false, message: 'Query template not found.', code: 'NOT_FOUND' };

  return { ok: true, templateId: tid };
}

export async function updateConnectionQueryModeForCurrentUser(
  projectId: string,
  connectionId: string,
  queryMode: string,
): Promise<ProjectDatabaseConnectionQueryModeUpdateApiResult> {
  const loaded = await loadConnectionForProject(projectId, connectionId);
  if (!loaded.ok) return loaded;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };
  const isAdmin = await assertOrgAdmin(supabase, loaded.organizationId, authRow.user.id);
  if (!isAdmin) return { ok: false, message: 'Only organization admins can update query mode.', code: 'FORBIDDEN' };

  const mode = String(queryMode ?? '').trim();
  if (!isQueryMode(mode)) {
    return { ok: false, message: 'Invalid query mode.', code: 'BAD_REQUEST' };
  }
  if (!isTemporarilyAllowedQueryModeForUpdate(mode)) {
    return {
      ok: false,
      message: 'Only "template_only" is currently allowed as a temporary restriction.',
      code: 'BAD_REQUEST',
    };
  }

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('database_connections')
    .update({ query_mode: mode })
    .eq('id', loaded.connectionId)
    .eq('organization_id', loaded.organizationId)
    .eq('is_deleted', false)
    .select('id,query_mode')
    .maybeSingle();
  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };
  if (!data) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const resolvedMode = String((data as { query_mode?: string | null }).query_mode ?? '');
  return {
    ok: true,
    connectionId: String((data as { id?: string }).id ?? loaded.connectionId),
    queryMode: isQueryMode(resolvedMode) ? resolvedMode : 'template_only',
  };
}
