/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import {
  getConnectionQueryModeForCurrentUser,
  updateConnectionQueryModeForCurrentUser,
} from '@/lib/database-connection/database-connection-query-templates-server';

type RouteContext = {
  params: Promise<{ projectId: string; connectionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, connectionId } = await context.params;
  const result = await getConnectionQueryModeForCurrentUser(projectId, connectionId);
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
  const queryMode = typeof b.queryMode === 'string' ? b.queryMode : '';
  const result = await updateConnectionQueryModeForCurrentUser(projectId, connectionId, queryMode);
  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
