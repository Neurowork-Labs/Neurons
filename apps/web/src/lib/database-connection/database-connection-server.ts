/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  getProjectContextForCurrentUser,
} from '@/lib/storage/storage-server-helpers';
import {
  formatMysqlConnectionError,
  introspectMysqlSchema,
  probeMysqlServerInfo,
  type MysqlConnectionParams,
  type MysqlSslMode,
} from '@/lib/database-connection/mysql-introspect';
import {
  formatMongoConnectionError,
  introspectMongoSchema,
  type MongoConnectionParams,
} from '@/lib/database-connection/mongodb-introspect';

export type LiveDatabaseConnectionRow = {
  id: string;
  displayName: string;
  databaseId: string | null;
  databaseTypeId: string;
  projectAgentId: string;
  status: string;
  createdAt: string;
  host: string;
  port: number;
  databaseName: string;
  queryMode: 'generated' | 'template_preferred' | 'template_only';
};

export type CreateDatabaseConnectionsPayload = {
  databaseTypeId: string;
  databaseId: string;
  displayName: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslMode: string;
  sslCaPem?: string | null;
  mongoUseSrv?: boolean;
  projectAgentIds: string[];
  reconnectWithPassword?: boolean;
  forceMismatch?: boolean;
};

export type CreateDatabaseConnectionsApiResult =
  | { ok: true; connectionIds: string[] }
  | {
      ok: false;
      message: string;
      code?: string;
      mismatch?: {
        expectedProduct: 'mysql' | 'mariadb';
        detectedProduct: 'mysql' | 'mariadb' | 'unknown';
        version: string;
        versionComment: string;
      };
    };

export type DeleteDatabaseConnectionApiResult =
  | { ok: true; connectionId: string }
  | { ok: false; message: string; code?: string };

export type UpdateDatabaseConnectionStatusApiResult =
  | { ok: true; connectionId: string; status: 'connected' | 'disconnected' | 'failed' }
  | { ok: false; message: string; code?: string };

export type LiveDatabaseConnectionCredentialsApiResult =
  | {
      ok: true;
      connection: {
        id: string;
        databaseTypeId: string;
        databaseId: string | null;
        displayName: string;
        host: string;
        port: number;
        databaseName: string;
        username: string;
        password: string;
        sslMode: string;
        sslCaPem: string | null;
        status: string;
        queryMode: 'generated' | 'template_preferred' | 'template_only';
      };
    }
  | { ok: false; message: string; code?: string };

export type DatabaseConnectionConflictApiResult =
  | { ok: true; conflicts: Array<{ projectAgentId: string; agentDisplayName: string }> }
  | { ok: false; message: string; code?: string };

type LiveDbIdentifier = 'mysql' | 'wp-mysql' | 'wp-mariadb' | 'mongodb';

function isMysqlIdentifier(v: string): v is 'mysql' | 'wp-mysql' | 'wp-mariadb' {
  return v === 'mysql' || v === 'wp-mysql' || v === 'wp-mariadb';
}

function snapshotEntityCount(snapshot: { dialect: 'mysql'; tables: unknown[] } | { dialect: 'mongodb'; collections: unknown[] }): number {
  return snapshot.dialect === 'mongodb' ? snapshot.collections.length : snapshot.tables.length;
}

function snapshotKind(snapshot: { dialect: 'mysql' | 'mongodb' }): 'relational' | 'document' {
  return snapshot.dialect === 'mongodb' ? 'document' : 'relational';
}

function isValidMongoSslMode(v: string): v is 'disable' | 'required' | 'verify_ca' | 'verify_identity' {
  return v === 'disable' || v === 'required' || v === 'verify_ca' || v === 'verify_identity';
}

function toQueryMode(v: unknown): 'generated' | 'template_preferred' | 'template_only' {
  const s = String(v ?? '').trim();
  if (s === 'generated' || s === 'template_preferred' || s === 'template_only') return s;
  return 'template_only';
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

export async function checkDatabaseConnectionConflictsForCurrentUser(
  projectId: string,
  payload: { displayName: string; projectAgentIds: string[] },
): Promise<DatabaseConnectionConflictApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

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

export async function listLiveDatabaseConnectionsForCurrentUser(
  projectId: string,
): Promise<
  | { ok: true; rows: LiveDatabaseConnectionRow[] }
  | { ok: false; message: string; code?: string }
> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  if (projectAgentIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const { data, error } = await supabase
    .from('database_connections')
    .select(
      'id,display_name,database_id,database_type_id,project_agent_id,status,created_at,host,port,database_name,query_mode',
    )
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, message: error.message, code: 'BAD_REQUEST' };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    displayName: String(r.display_name ?? ''),
    databaseId: r.database_id ? String(r.database_id) : null,
    databaseTypeId: String(r.database_type_id ?? ''),
    projectAgentId: String(r.project_agent_id ?? ''),
    status: String(r.status ?? ''),
    createdAt: String(r.created_at ?? ''),
    host: String(r.host ?? ''),
    port: Number(r.port ?? 3306),
    databaseName: String(r.database_name ?? ''),
    queryMode: toQueryMode(r.query_mode),
  }));

  return { ok: true, rows };
}

export async function createDatabaseConnectionsForCurrentUser(
  projectId: string,
  payload: CreateDatabaseConnectionsPayload,
): Promise<CreateDatabaseConnectionsApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) {
    return { ok: false, message: 'Only organization admins can connect databases.', code: 'FORBIDDEN' };
  }

  const validPa = new Set(context.projectAgentRows.map((r) => r.projectAgentId));
  const selectedIds = [...new Set(payload.projectAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean))].filter(
    (id) => validPa.has(id),
  );
  if (selectedIds.length === 0) {
    return { ok: false, message: 'Select at least one connected agent.', code: 'BAD_REQUEST' };
  }

  const displayName = String(payload.displayName ?? '').trim();
  const host = String(payload.host ?? '').trim();
  const databaseName = String(payload.databaseName ?? '').trim();
  const username = String(payload.username ?? '').trim();
  const password = String(payload.password ?? '');
  const databaseTypeId = String(payload.databaseTypeId ?? '').trim();
  const databaseId = String(payload.databaseId ?? '').trim();

  if (!displayName) return { ok: false, message: 'Display name is required.', code: 'BAD_REQUEST' };
  if (!host) return { ok: false, message: 'Host is required.', code: 'BAD_REQUEST' };
  if (!databaseName) return { ok: false, message: 'Database name is required.', code: 'BAD_REQUEST' };
  if (!username) return { ok: false, message: 'Username is required.', code: 'BAD_REQUEST' };
  if (!password) return { ok: false, message: 'Password is required.', code: 'BAD_REQUEST' };
  if (!databaseTypeId || !databaseId) {
    return { ok: false, message: 'Database type and database product are required.', code: 'BAD_REQUEST' };
  }

  const sslMode = String(payload.sslMode ?? 'required').trim() || 'required';
  const reconnectWithPassword = payload.reconnectWithPassword === true;
  const forceMismatch = payload.forceMismatch === true;

  const { data: dbProduct, error: dbErr } = await supabase
    .from('databases')
    .select('id,identifier,database_type_id')
    .eq('id', databaseId)
    .eq('is_active', true)
    .maybeSingle();
  if (dbErr) return { ok: false, message: dbErr.message, code: 'BAD_REQUEST' };
  if (!dbProduct) return { ok: false, message: 'Invalid database product.', code: 'BAD_REQUEST' };
  if (String((dbProduct as { database_type_id?: string }).database_type_id) !== databaseTypeId) {
    return { ok: false, message: 'Database product does not match the selected database type.', code: 'BAD_REQUEST' };
  }
  const dbIdentifier = String((dbProduct as { identifier?: string }).identifier ?? '').trim() as LiveDbIdentifier;
  const allowedLiveIdentifiers = new Set<LiveDbIdentifier>(['mysql', 'wp-mysql', 'wp-mariadb', 'mongodb']);
  if (!allowedLiveIdentifiers.has(dbIdentifier)) {
    return { ok: false, message: 'Only MySQL/MariaDB/MongoDB live connections are supported for now.', code: 'BAD_REQUEST' };
  }

  let port = Number(payload.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    port = dbIdentifier === 'mongodb' ? 27017 : 3306;
  }

  if (isMysqlIdentifier(dbIdentifier)) {
    const allowedSsl: MysqlSslMode[] = ['disable', 'preferred', 'required', 'verify_ca', 'verify_identity'];
    if (!allowedSsl.includes(sslMode as MysqlSslMode)) {
      return { ok: false, message: 'Invalid SSL/TLS mode.', code: 'BAD_REQUEST' };
    }
  }
  if (dbIdentifier === 'mongodb') {
    if (!isValidMongoSslMode(sslMode)) {
      return { ok: false, message: 'Invalid SSL/TLS mode.', code: 'BAD_REQUEST' };
    }
    if ((sslMode === 'verify_ca' || sslMode === 'verify_identity') && !String(payload.sslCaPem ?? '').trim()) {
      return { ok: false, message: 'SSL/TLS mode requires a CA certificate (PEM).', code: 'BAD_REQUEST' };
    }
  }
  if (dbIdentifier === 'mongodb') {
    if (!isValidMongoSslMode(sslMode)) {
      return { ok: false, message: 'Invalid SSL/TLS mode.', code: 'BAD_REQUEST' };
    }
    if ((sslMode === 'verify_ca' || sslMode === 'verify_identity') && !String(payload.sslCaPem ?? '').trim()) {
      return { ok: false, message: 'SSL/TLS mode requires a CA certificate (PEM).', code: 'BAD_REQUEST' };
    }
  }

  const conflictRes = await checkDatabaseConnectionConflictsForCurrentUser(projectId, {
    displayName,
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

  // If a matching soft-deleted connection exists for selected agent(s), ask for
  // explicit password confirmation before restoring instead of creating a new row.
  const { data: deletedMatches, error: deletedErr } = await supabase
    .from('database_connections')
    .select('id, project_agent_id, database_type_id, database_id, display_name, created_at')
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', true)
    .eq('host', host)
    .eq('port', port)
    .eq('database_name', databaseName)
    .eq('username', username)
    .eq('ssl_mode', sslMode)
    .in('project_agent_id', selectedIds)
    .order('created_at', { ascending: false });
  if (deletedErr) return { ok: false, message: deletedErr.message, code: 'BAD_REQUEST' };

  const deletedByProjectAgentId = new Map<string, string>();
  for (const row of (deletedMatches ?? []) as Array<{
    id?: string;
    project_agent_id?: string;
    database_type_id?: string | null;
    database_id?: string | null;
    display_name?: string | null;
  }>) {
    const paId = String(row.project_agent_id ?? '').trim();
    const id = String(row.id ?? '').trim();
    if (!paId || !id) continue;
    // Keep this tolerant so older rows (for example null database_id / changed display name)
    // can still be reused when core connection metadata matches.
    const rowTypeId = String(row.database_type_id ?? '').trim();
    if (rowTypeId && rowTypeId !== databaseTypeId) continue;
    const rowDbId = row.database_id ? String(row.database_id).trim() : '';
    if (rowDbId && rowDbId !== databaseId) continue;
    const rowDisplay = String(row.display_name ?? '').trim();
    if (rowDisplay && rowDisplay !== displayName) continue;
    if (!deletedByProjectAgentId.has(paId)) {
      deletedByProjectAgentId.set(paId, id);
    }
  }
  if (deletedByProjectAgentId.size > 0 && !reconnectWithPassword) {
    return {
      ok: false,
      message:
        'A matching deleted connection already exists. Confirm with password to restore and sync this connection instead of creating a new row.',
      code: 'PASSWORD_CONFIRM_REQUIRED',
    };
  }

  const mysqlParams: MysqlConnectionParams = {
    host,
    port,
    database: databaseName,
    user: username,
    password,
    sslMode: sslMode as MysqlSslMode,
    sslCaPem: payload.sslCaPem?.trim() || null,
  };
  const mongoParams: MongoConnectionParams = {
    host,
    port,
    database: databaseName,
    user: username,
    password,
    sslMode: (isValidMongoSslMode(sslMode) ? sslMode : 'required') as MongoConnectionParams['sslMode'],
    sslCaPem: payload.sslCaPem?.trim() || null,
    useSrv: payload.mongoUseSrv === true,
  };

  let snapshot:
    | Awaited<ReturnType<typeof introspectMysqlSchema>>
    | Awaited<ReturnType<typeof introspectMongoSchema>>;

  if (isMysqlIdentifier(dbIdentifier)) {
    const expectedProduct: 'mysql' | 'mariadb' = dbIdentifier === 'wp-mariadb' ? 'mariadb' : 'mysql';
    try {
      const server = await probeMysqlServerInfo(mysqlParams);
      const detected = server.product;
      const isMismatch =
        detected !== 'unknown' &&
        ((expectedProduct === 'mysql' && detected !== 'mysql') || (expectedProduct === 'mariadb' && detected !== 'mariadb'));
      if (isMismatch && !forceMismatch) {
        return {
          ok: false,
          code: 'DB_SERVER_MISMATCH',
          message:
            `You selected ${expectedProduct === 'mariadb' ? 'MariaDB' : 'MySQL'}, but the server looks like ${detected === 'mariadb' ? 'MariaDB' : 'MySQL'} based on VERSION(). Confirm to continue anyway.`,
          mismatch: {
            expectedProduct,
            detectedProduct: detected,
            version: server.version,
            versionComment: server.versionComment,
          },
        };
      }
    } catch {
      // If we can't probe version info but we can connect later, don't block.
    }
    try {
      snapshot = await introspectMysqlSchema(mysqlParams);
    } catch (e) {
      return { ok: false, message: formatMysqlConnectionError(e), code: 'BAD_REQUEST' };
    }
  } else {
    try {
      snapshot = await introspectMongoSchema(mongoParams);
    } catch (e) {
      return { ok: false, message: formatMongoConnectionError(e), code: 'BAD_REQUEST' };
    }
  }

  const admin = getSupabaseServiceRoleClient();
  const createdConnectionIds: string[] = [];
  const allConnectionIds: string[] = [];
  const revivedConnectionIds: string[] = [];

  try {
    for (const projectAgentId of selectedIds) {
      const reusableId = deletedByProjectAgentId.get(projectAgentId) ?? null;
      let connectionId = '';

      if (reusableId) {
        connectionId = reusableId;
        const { error: reviveErr } = await admin
          .from('database_connections')
          .update({
            is_deleted: false,
            status: 'pending',
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connectionId);
        if (reviveErr) throw new Error(reviveErr.message);
        revivedConnectionIds.push(connectionId);
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('database_connections')
          .insert({
            organization_id: context.organizationId,
            project_agent_id: projectAgentId,
            database_type_id: databaseTypeId,
            database_id: databaseId,
            display_name: displayName,
            host,
            port,
            database_name: databaseName,
            username,
            ssl_mode: sslMode,
            status: 'pending',
          })
          .select('id')
          .maybeSingle();

        if (insErr) throw new Error(insErr.message);
        connectionId = String((ins as { id?: string } | null)?.id ?? '');
        if (!connectionId) throw new Error('Connection insert failed.');
        createdConnectionIds.push(connectionId);
      }
      allConnectionIds.push(connectionId);

      // Replace secret row atomically per connection.
      await admin.from('database_connection_secrets').delete().eq('connection_id', connectionId);
      const { error: secErr } = await admin.from('database_connection_secrets').insert({
        connection_id: connectionId,
        password_value: password,
        ssl_ca_pem: payload.sslCaPem?.trim() || null,
      });
      if (secErr) throw new Error(secErr.message);

      const { data: existingSchema, error: existingSchemaErr } = await admin
        .from('database_connection_schemas')
        .select('id')
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (existingSchemaErr) throw new Error(existingSchemaErr.message);

      if (existingSchema?.id) {
        const { error: schErr } = await admin
          .from('database_connection_schemas')
          .update({
            schema_snapshot: snapshot as unknown as Record<string, unknown>,
            table_count: snapshotEntityCount(snapshot),
            entity_count: snapshotEntityCount(snapshot),
            snapshot_kind: snapshotKind(snapshot),
            status: 'ready',
            fetched_at: snapshot.fetchedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('connection_id', connectionId);
        if (schErr) throw new Error(schErr.message);
      } else {
        const { error: schErr } = await supabase.from('database_connection_schemas').insert({
          connection_id: connectionId,
          organization_id: context.organizationId,
          schema_snapshot: snapshot as unknown as Record<string, unknown>,
          table_count: snapshotEntityCount(snapshot),
          entity_count: snapshotEntityCount(snapshot),
          snapshot_kind: snapshotKind(snapshot),
          status: 'ready',
          fetched_at: snapshot.fetchedAt,
        });
        if (schErr) throw new Error(schErr.message);
      }

      const { error: upErr } = await supabase
        .from('database_connections')
        .update({
          status: 'connected',
          last_tested_at: new Date().toISOString(),
          last_error: null,
          last_introspected_at: snapshot.fetchedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);
      if (upErr) throw new Error(upErr.message);
    }

    return { ok: true, connectionIds: allConnectionIds };
  } catch (e) {
    for (const cid of createdConnectionIds) {
      await admin.from('database_connections').delete().eq('id', cid);
    }
    for (const cid of revivedConnectionIds) {
      await admin
        .from('database_connections')
        .update({ is_deleted: true, status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('id', cid);
    }
    const msg = e instanceof Error ? e.message : 'Could not save connection.';
    return { ok: false, message: msg, code: 'BAD_REQUEST' };
  }
}

export async function deleteDatabaseConnectionForCurrentUser(
  projectId: string,
  connectionId: string,
): Promise<DeleteDatabaseConnectionApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) {
    return { ok: false, message: 'Only organization admins can remove database connections.', code: 'FORBIDDEN' };
  }

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: row, error: loadErr } = await supabase
    .from('database_connections')
    .select('id')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!row) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const admin = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { error: delErr } = await admin
    .from('database_connections')
    .update({ is_deleted: true, status: 'disconnected', last_error: null, updated_at: nowIso })
    .eq('id', cid);
  if (delErr) return { ok: false, message: delErr.message, code: 'BAD_REQUEST' };

  return { ok: true, connectionId: cid };
}

export async function fetchDatabaseConnectionCredentialsForCurrentUser(
  projectId: string,
  connectionId: string,
): Promise<LiveDatabaseConnectionCredentialsApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) {
    return { ok: false, message: 'Only organization admins can view connection credentials.', code: 'FORBIDDEN' };
  }

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: connRow, error: loadErr } = await supabase
    .from('database_connections')
    .select('id,database_type_id,database_id,display_name,host,port,database_name,username,ssl_mode,status,query_mode')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!connRow) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const admin = getSupabaseServiceRoleClient();
  const { data: secretRow, error: secErr } = await admin
    .from('database_connection_secrets')
    .select('password_value,ssl_ca_pem')
    .eq('connection_id', cid)
    .maybeSingle();
  if (secErr) return { ok: false, message: secErr.message, code: 'BAD_REQUEST' };
  if (!secretRow) return { ok: false, message: 'Connection secrets not found.', code: 'BAD_REQUEST' };

  return {
    ok: true,
    connection: {
      id: String(connRow.id ?? ''),
      databaseTypeId: String(connRow.database_type_id ?? ''),
      databaseId: connRow.database_id ? String(connRow.database_id) : null,
      displayName: String(connRow.display_name ?? ''),
      host: String(connRow.host ?? ''),
      port: Number(connRow.port ?? 3306),
      databaseName: String(connRow.database_name ?? ''),
      username: String(connRow.username ?? ''),
      password: String((secretRow as { password_value?: string | null }).password_value ?? ''),
      sslMode: String(connRow.ssl_mode ?? 'required'),
      sslCaPem: String((secretRow as { ssl_ca_pem?: string | null }).ssl_ca_pem ?? '').trim() || null,
      status: String(connRow.status ?? ''),
      queryMode: toQueryMode((connRow as { query_mode?: string | null }).query_mode),
    },
  };
}

export async function updateDatabaseConnectionCredentialsForCurrentUser(
  projectId: string,
  connectionId: string,
  payload: {
    displayName: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password: string;
    sslMode: string;
    sslCaPem?: string | null;
    mongoUseSrv?: boolean;
  },
): Promise<LiveDatabaseConnectionCredentialsApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) {
    return { ok: false, message: 'Only organization admins can update connection credentials.', code: 'FORBIDDEN' };
  }

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const displayName = String(payload.displayName ?? '').trim();
  const host = String(payload.host ?? '').trim();
  const databaseName = String(payload.databaseName ?? '').trim();
  const username = String(payload.username ?? '').trim();
  const password = String(payload.password ?? '');
  const sslMode = payload.sslMode;

  if (!displayName) return { ok: false, message: 'Display name is required.', code: 'BAD_REQUEST' };
  if (!host) return { ok: false, message: 'Host is required.', code: 'BAD_REQUEST' };
  if (!databaseName) return { ok: false, message: 'Database name is required.', code: 'BAD_REQUEST' };
  if (!username) return { ok: false, message: 'Username is required.', code: 'BAD_REQUEST' };
  if (!password) return { ok: false, message: 'Password is required.', code: 'BAD_REQUEST' };

  let port = Number(payload.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) port = 3306;

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: connRow, error: loadErr } = await supabase
    .from('database_connections')
    .select('id,status,database_id')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!connRow) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const databaseId = String((connRow as { database_id?: string | null }).database_id ?? '').trim();
  const { data: dbProduct, error: dbErr } = await supabase
    .from('databases')
    .select('identifier')
    .eq('id', databaseId)
    .maybeSingle();
  if (dbErr) return { ok: false, message: dbErr.message, code: 'BAD_REQUEST' };
  const dbIdentifier = String((dbProduct as { identifier?: string }).identifier ?? '').trim();
  if (dbIdentifier === 'mongodb' && (!Number.isFinite(Number(payload.port)) || Number(payload.port) < 1 || Number(payload.port) > 65535)) {
    port = 27017;
  }
  if (isMysqlIdentifier(dbIdentifier)) {
    const allowedSsl: MysqlSslMode[] = ['disable', 'preferred', 'required', 'verify_ca', 'verify_identity'];
    if (!allowedSsl.includes(sslMode as MysqlSslMode)) {
      return { ok: false, message: 'Invalid SSL/TLS mode.', code: 'BAD_REQUEST' };
    }
  }

  const admin = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from('database_connections')
    .update({
      display_name: displayName,
      host,
      port,
      database_name: databaseName,
      username,
      ssl_mode: sslMode,
      status: 'disconnected',
      last_error: null,
      updated_at: nowIso,
    })
    .eq('id', cid);
  if (updErr) return { ok: false, message: updErr.message, code: 'BAD_REQUEST' };

  await admin.from('database_connection_secrets').delete().eq('connection_id', cid);
  const { error: secErr } = await admin.from('database_connection_secrets').insert({
    connection_id: cid,
    password_value: password,
    ssl_ca_pem: payload.sslCaPem?.trim() || null,
  });
  if (secErr) return { ok: false, message: secErr.message, code: 'BAD_REQUEST' };

  return fetchDatabaseConnectionCredentialsForCurrentUser(projectId, cid);
}

export async function updateDatabaseConnectionStatusForCurrentUser(
  projectId: string,
  connectionId: string,
  targetStatus: 'connected' | 'disconnected',
): Promise<UpdateDatabaseConnectionStatusApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) {
    return { ok: false, message: 'Only organization admins can update connection status.', code: 'FORBIDDEN' };
  }

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: connRow, error: loadErr } = await supabase
    .from('database_connections')
    .select('id,project_agent_id,host,port,database_name,username,ssl_mode,status,database_id')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!connRow) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const nowIso = new Date().toISOString();
  const admin = getSupabaseServiceRoleClient();

  if (targetStatus === 'disconnected') {
    const { error: updErr } = await admin
      .from('database_connections')
      .update({ status: 'disconnected', last_error: null, updated_at: nowIso })
      .eq('id', cid);
    if (updErr) return { ok: false, message: updErr.message, code: 'BAD_REQUEST' };
    return { ok: true, connectionId: cid, status: 'disconnected' };
  }

  const projectAgentId = String((connRow as { project_agent_id?: string | null }).project_agent_id ?? '').trim();
  if (!projectAgentId) {
    return { ok: false, message: 'Connection agent mapping not found.', code: 'BAD_REQUEST' };
  }

  // Reconnect guard: one agent may have only one attached DB.
  // Allow reconnect only when no other active live connection or uploaded DB exists.
  const [liveRes, uploadRes] = await Promise.all([
    supabase
      .from('database_connections')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('project_agent_id', projectAgentId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'connected'])
      .neq('id', cid)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('document_database_schemas')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('project_agent_id', projectAgentId)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle(),
  ]);
  if (liveRes.error) return { ok: false, message: liveRes.error.message, code: 'BAD_REQUEST' };
  if (uploadRes.error) return { ok: false, message: uploadRes.error.message, code: 'BAD_REQUEST' };
  if (liveRes.data?.id || uploadRes.data?.id) {
    return {
      ok: false,
      message: 'You cannot connect more than one database with a single agent.',
      code: 'NAME_CONFLICT',
    };
  }

  const { data: secretRow, error: secErr } = await admin
    .from('database_connection_secrets')
    .select('password_value,ssl_ca_pem')
    .eq('connection_id', cid)
    .maybeSingle();
  if (secErr) return { ok: false, message: secErr.message, code: 'BAD_REQUEST' };
  if (!secretRow) return { ok: false, message: 'Connection secrets not found.', code: 'BAD_REQUEST' };

  const databaseId = String((connRow as { database_id?: string | null }).database_id ?? '').trim();
  const { data: dbProduct, error: dbErr } = await supabase
    .from('databases')
    .select('identifier')
    .eq('id', databaseId)
    .maybeSingle();
  if (dbErr) return { ok: false, message: dbErr.message, code: 'BAD_REQUEST' };
  const dbIdentifier = String((dbProduct as { identifier?: string }).identifier ?? '').trim();

  const mysqlParams: MysqlConnectionParams = {
    host: String(connRow.host ?? ''),
    port: Number(connRow.port ?? 3306),
    database: String(connRow.database_name ?? ''),
    user: String(connRow.username ?? ''),
    password: String((secretRow as { password_value?: string | null }).password_value ?? ''),
    sslMode: String(connRow.ssl_mode ?? 'required') as MysqlSslMode,
    sslCaPem: String((secretRow as { ssl_ca_pem?: string | null }).ssl_ca_pem ?? '').trim() || null,
  };
  const mongoParams: MongoConnectionParams = {
    host: String(connRow.host ?? ''),
    port: Number(connRow.port ?? 27017),
    database: String(connRow.database_name ?? ''),
    user: String(connRow.username ?? ''),
    password: String((secretRow as { password_value?: string | null }).password_value ?? ''),
    sslMode: (isValidMongoSslMode(String(connRow.ssl_mode ?? 'required'))
      ? String(connRow.ssl_mode ?? 'required')
      : 'required') as MongoConnectionParams['sslMode'],
    sslCaPem: String((secretRow as { ssl_ca_pem?: string | null }).ssl_ca_pem ?? '').trim() || null,
    useSrv: String(connRow.host ?? '').trim().toLowerCase().endsWith('.mongodb.net'),
  };

  await admin
    .from('database_connection_schemas')
    .update({ status: 'processing', updated_at: nowIso })
    .eq('connection_id', cid);

  try {
    const snapshot = isMysqlIdentifier(dbIdentifier)
      ? await introspectMysqlSchema(mysqlParams)
      : await introspectMongoSchema(mongoParams);
    const { data: existing } = await admin
      .from('database_connection_schemas')
      .select('id')
      .eq('connection_id', cid)
      .maybeSingle();

    if (existing?.id) {
      const { error: updSchemaErr } = await admin
        .from('database_connection_schemas')
        .update({
          schema_snapshot: snapshot as unknown as Record<string, unknown>,
          table_count: snapshotEntityCount(snapshot),
          entity_count: snapshotEntityCount(snapshot),
          snapshot_kind: snapshotKind(snapshot),
          status: 'ready',
          fetched_at: snapshot.fetchedAt,
          updated_at: nowIso,
        })
        .eq('connection_id', cid);
      if (updSchemaErr) throw new Error(updSchemaErr.message);
    } else {
      const { error: insSchemaErr } = await admin.from('database_connection_schemas').insert({
        connection_id: cid,
        organization_id: context.organizationId,
        schema_snapshot: snapshot as unknown as Record<string, unknown>,
        table_count: snapshotEntityCount(snapshot),
        entity_count: snapshotEntityCount(snapshot),
        snapshot_kind: snapshotKind(snapshot),
        status: 'ready',
        fetched_at: snapshot.fetchedAt,
        updated_at: nowIso,
      });
      if (insSchemaErr) throw new Error(insSchemaErr.message);
    }

    const { error: connUpdErr } = await admin
      .from('database_connections')
      .update({
        status: 'connected',
        last_tested_at: nowIso,
        last_error: null,
        last_introspected_at: snapshot.fetchedAt,
        updated_at: nowIso,
      })
      .eq('id', cid);
    if (connUpdErr) throw new Error(connUpdErr.message);

    return { ok: true, connectionId: cid, status: 'connected' };
  } catch (e) {
    const msg = isMysqlIdentifier(dbIdentifier) ? formatMysqlConnectionError(e) : formatMongoConnectionError(e);
    await admin
      .from('database_connections')
      .update({
        status: 'failed',
        last_tested_at: nowIso,
        last_error: msg,
        updated_at: nowIso,
      })
      .eq('id', cid);
    await admin
      .from('database_connection_schemas')
      .update({ status: 'failed', updated_at: nowIso })
      .eq('connection_id', cid);
    return { ok: false, message: msg, code: 'BAD_REQUEST' };
  }
}

export type SyncDatabaseConnectionSchemaApiResult =
  | { ok: true; connectionId: string; status: 'connected' | 'failed' }
  | { ok: false; message: string; code?: string };

export async function syncDatabaseConnectionSchemaForCurrentUser(
  projectId: string,
  connectionId: string,
): Promise<SyncDatabaseConnectionSchemaApiResult> {
  const context = await getProjectContextForCurrentUser(projectId);
  if (!context.ok) return context;

  const supabase = await getSupabaseServerClient();
  const { data: authRow, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, message: authErr.message, code: 'BAD_REQUEST' };
  if (!authRow.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authRow.user.id;
  const isAdmin = await assertOrgAdmin(supabase, context.organizationId, userId);
  if (!isAdmin) return { ok: false, message: 'Only organization admins can sync database schemas.', code: 'FORBIDDEN' };

  const cid = String(connectionId ?? '').trim();
  if (!cid) return { ok: false, message: 'Missing connection id.', code: 'BAD_REQUEST' };

  const projectAgentIds = context.projectAgentRows.map((r) => r.projectAgentId);
  const { data: connRow, error: loadErr } = await supabase
    .from('database_connections')
    .select('id,host,port,database_name,username,ssl_mode,status,database_id')
    .eq('id', cid)
    .eq('organization_id', context.organizationId)
    .eq('is_deleted', false)
    .in('project_agent_id', projectAgentIds)
    .maybeSingle();

  if (loadErr) return { ok: false, message: loadErr.message, code: 'BAD_REQUEST' };
  if (!connRow) return { ok: false, message: 'Connection not found.', code: 'NOT_FOUND' };

  const status = String(connRow.status ?? '').toLowerCase();
  if (status !== 'connected') {
    return { ok: false, message: 'Connection is not in `connected` state.', code: 'BAD_REQUEST' };
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: secretRow, error: secErr } = await admin
    .from('database_connection_secrets')
    .select('password_value,ssl_ca_pem')
    .eq('connection_id', cid)
    .maybeSingle();
  if (secErr) return { ok: false, message: secErr.message, code: 'BAD_REQUEST' };
  if (!secretRow) return { ok: false, message: 'Connection secrets not found.', code: 'BAD_REQUEST' };

  const databaseId = String((connRow as { database_id?: string | null }).database_id ?? '').trim();
  const { data: dbProduct, error: dbErr } = await supabase
    .from('databases')
    .select('identifier')
    .eq('id', databaseId)
    .maybeSingle();
  if (dbErr) return { ok: false, message: dbErr.message, code: 'BAD_REQUEST' };
  const dbIdentifier = String((dbProduct as { identifier?: string }).identifier ?? '').trim();

  const mysqlParams: MysqlConnectionParams = {
    host: String(connRow.host ?? ''),
    port: Number(connRow.port ?? 3306),
    database: String(connRow.database_name ?? ''),
    user: String(connRow.username ?? ''),
    password: String((secretRow as { password_value?: string | null }).password_value ?? ''),
    sslMode: String(connRow.ssl_mode ?? 'required') as MysqlSslMode,
    sslCaPem: String((secretRow as { ssl_ca_pem?: string | null }).ssl_ca_pem ?? '').trim() || null,
  };
  const mongoParams: MongoConnectionParams = {
    host: String(connRow.host ?? ''),
    port: Number(connRow.port ?? 27017),
    database: String(connRow.database_name ?? ''),
    user: String(connRow.username ?? ''),
    password: String((secretRow as { password_value?: string | null }).password_value ?? ''),
    sslMode: (isValidMongoSslMode(String(connRow.ssl_mode ?? 'required'))
      ? String(connRow.ssl_mode ?? 'required')
      : 'required') as MongoConnectionParams['sslMode'],
    sslCaPem: String((secretRow as { ssl_ca_pem?: string | null }).ssl_ca_pem ?? '').trim() || null,
    useSrv: String(connRow.host ?? '').trim().toLowerCase().endsWith('.mongodb.net'),
  };

  const nowIso = new Date().toISOString();

  // Mark schema as "processing" while we introspect.
  await admin
    .from('database_connection_schemas')
    .update({ status: 'processing', updated_at: nowIso })
    .eq('connection_id', cid);

  try {
    const snapshot = isMysqlIdentifier(dbIdentifier)
      ? await introspectMysqlSchema(mysqlParams)
      : await introspectMongoSchema(mongoParams);

    const { data: existing } = await admin
      .from('database_connection_schemas')
      .select('id')
      .eq('connection_id', cid)
      .maybeSingle();

    if (existing?.id) {
      const { error: updErr } = await admin
        .from('database_connection_schemas')
        .update({
          schema_snapshot: snapshot as unknown as Record<string, unknown>,
          table_count: snapshotEntityCount(snapshot),
          entity_count: snapshotEntityCount(snapshot),
          snapshot_kind: snapshotKind(snapshot),
          status: 'ready',
          fetched_at: snapshot.fetchedAt,
          updated_at: nowIso,
        })
        .eq('connection_id', cid);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await admin.from('database_connection_schemas').insert({
        connection_id: cid,
        organization_id: context.organizationId,
        schema_snapshot: snapshot as unknown as Record<string, unknown>,
        table_count: snapshotEntityCount(snapshot),
        entity_count: snapshotEntityCount(snapshot),
        snapshot_kind: snapshotKind(snapshot),
        status: 'ready',
        fetched_at: snapshot.fetchedAt,
        updated_at: nowIso,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: connErr2 } = await admin
      .from('database_connections')
      .update({
        status: 'connected',
        last_tested_at: nowIso,
        last_error: null,
        last_introspected_at: snapshot.fetchedAt,
        updated_at: nowIso,
      })
      .eq('id', cid);
    if (connErr2) throw new Error(connErr2.message);

    return { ok: true, connectionId: cid, status: 'connected' };
  } catch (e) {
    const msg = isMysqlIdentifier(dbIdentifier) ? formatMysqlConnectionError(e) : formatMongoConnectionError(e);

    const { error: connErr2 } = await admin
      .from('database_connections')
      .update({
        status: 'failed',
        last_tested_at: nowIso,
        last_error: msg,
        last_introspected_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', cid);
    if (connErr2) {
      return { ok: false, message: msg, code: 'BAD_REQUEST' };
    }

    await admin
      .from('database_connection_schemas')
      .update({ status: 'failed', updated_at: nowIso })
      .eq('connection_id', cid);

    return { ok: false, message: msg, code: 'BAD_REQUEST' };
  }
}
