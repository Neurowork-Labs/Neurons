/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { checkDatabaseConnectionConflictsForCurrentUser } from '@/lib/database-connection/database-connection-server';

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
  const displayName = typeof b.displayName === 'string' ? b.displayName : '';
  const projectAgentIds = Array.isArray(b.projectAgentIds)
    ? b.projectAgentIds.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];

  const result = await checkDatabaseConnectionConflictsForCurrentUser(projectId, {
    displayName,
    projectAgentIds,
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result, { status: 400 });
}
