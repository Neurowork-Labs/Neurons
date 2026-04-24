/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { createDatabaseConnectionsForCurrentUser } from '@/lib/database-connection/database-connection-server';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const databaseTypeId = typeof b.databaseTypeId === 'string' ? b.databaseTypeId : '';
  const databaseId = typeof b.databaseId === 'string' ? b.databaseId : '';
  const displayName = typeof b.displayName === 'string' ? b.displayName : '';
  const host = typeof b.host === 'string' ? b.host : '';
  const port = typeof b.port === 'number' ? b.port : Number(b.port);
  const databaseName = typeof b.databaseName === 'string' ? b.databaseName : '';
  const username = typeof b.username === 'string' ? b.username : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const sslMode = typeof b.sslMode === 'string' ? b.sslMode : 'required';
  const sslCaPem = typeof b.sslCaPem === 'string' ? b.sslCaPem : null;
  const mongoUseSrv = b.mongoUseSrv === true;
  const reconnectWithPassword = b.reconnectWithPassword === true;
  const forceMismatch = b.forceMismatch === true;
  const projectAgentIds = Array.isArray(b.projectAgentIds)
    ? b.projectAgentIds.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];

  console.info('[database-connections][POST] connect button clicked', {
    projectId,
    databaseTypeId,
    databaseId,
    displayName,
    host,
    port: Number.isFinite(port) ? port : Number.NaN,
    databaseName,
    username,
    sslMode,
    mongoUseSrv,
    reconnectWithPassword,
    forceMismatch,
    projectAgentIdsCount: projectAgentIds.length,
  });

  const result = await createDatabaseConnectionsForCurrentUser(projectId, {
    databaseTypeId,
    databaseId,
    displayName,
    host,
    port: Number.isFinite(port) ? port : Number.NaN,
    databaseName,
    username,
    password,
    sslMode,
    sslCaPem,
    mongoUseSrv,
    reconnectWithPassword,
    forceMismatch,
    projectAgentIds,
  });

  if (result.ok) {
    console.info('[database-connections][POST] connect success', {
      projectId,
      databaseTypeId,
      databaseId,
      displayName,
      host,
      port: Number.isFinite(port) ? port : 3306,
      reconnectWithPassword,
      forceMismatch,
      projectAgentIdsCount: projectAgentIds.length,
      message: (result as { message?: string }).message ?? null,
    });
  } else {
    console.error('[database-connections][POST] connect failed', {
      projectId,
      databaseTypeId,
      databaseId,
      displayName,
      host,
      port: Number.isFinite(port) ? port : 3306,
      reconnectWithPassword,
      forceMismatch,
      projectAgentIdsCount: projectAgentIds.length,
      code: result.code ?? null,
      message: result.message,
    });
  }

  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  if (result.code === 'NAME_CONFLICT') return NextResponse.json(result, { status: 409 });
  if (result.code === 'PASSWORD_CONFIRM_REQUIRED') return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result, { status: 400 });
}
