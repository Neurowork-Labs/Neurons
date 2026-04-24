/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { syncDatabaseConnectionSchemaForCurrentUser } from '@/lib/database-connection/database-connection-server';

type RouteContext = {
  params: Promise<{ projectId: string; connectionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { projectId, connectionId } = await context.params;

  const result = await syncDatabaseConnectionSchemaForCurrentUser(projectId, connectionId);

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

