/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import {
  deleteDatabaseConnectionForCurrentUser,
  fetchDatabaseConnectionCredentialsForCurrentUser,
  updateDatabaseConnectionCredentialsForCurrentUser,
  updateDatabaseConnectionStatusForCurrentUser,
} from '@/lib/database-connection/database-connection-server';

type RouteContext = {
  params: Promise<{ projectId: string; connectionId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId, connectionId } = await context.params;

  const result = await deleteDatabaseConnectionForCurrentUser(projectId, connectionId);

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, connectionId } = await context.params;
  const result = await fetchDatabaseConnectionCredentialsForCurrentUser(projectId, connectionId);
  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, connectionId } = await context.params;

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
  const action = typeof b.action === 'string' ? b.action : '';

  if (action === 'disconnect' || action === 'reconnect') {
    const target = action === 'disconnect' ? 'disconnected' : 'connected';
    const result = await updateDatabaseConnectionStatusForCurrentUser(projectId, connectionId, target);
    if (result.ok) {
      console.info('[database-connections][PATCH] status update success', {
        projectId,
        connectionId,
        action,
        target,
        message: (result as { message?: string }).message ?? null,
      });
    } else {
      console.error('[database-connections][PATCH] status update failed', {
        projectId,
        connectionId,
        action,
        target,
        code: result.code ?? null,
        message: result.message,
      });
    }
    if (result.ok) return NextResponse.json(result, { status: 200 });
    if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
    if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
    if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
    return NextResponse.json(result, { status: 400 });
  }

  const displayName = typeof b.displayName === 'string' ? b.displayName : '';
  const host = typeof b.host === 'string' ? b.host : '';
  const port = typeof b.port === 'number' ? b.port : Number(b.port);
  const databaseName = typeof b.databaseName === 'string' ? b.databaseName : '';
  const username = typeof b.username === 'string' ? b.username : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const sslMode = typeof b.sslMode === 'string' ? b.sslMode : 'required';
  const sslCaPem = typeof b.sslCaPem === 'string' ? b.sslCaPem : null;
  const mongoUseSrv = b.mongoUseSrv === true;

  const result = await updateDatabaseConnectionCredentialsForCurrentUser(projectId, connectionId, {
    displayName,
    host,
    port: Number.isFinite(port) ? port : Number.NaN,
    databaseName,
    username,
    password,
    sslMode,
    sslCaPem,
    mongoUseSrv,
  });

  if (result.ok) {
    console.info('[database-connections][PATCH] credentials update success', {
      projectId,
      connectionId,
      displayName,
      host,
      port: Number.isFinite(port) ? port : 3306,
      databaseName,
      username,
      message: (result as { message?: string }).message ?? null,
    });
  } else {
    console.error('[database-connections][PATCH] credentials update failed', {
      projectId,
      connectionId,
      displayName,
      host,
      port: Number.isFinite(port) ? port : 3306,
      databaseName,
      username,
      code: result.code ?? null,
      message: result.message,
    });
  }

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
