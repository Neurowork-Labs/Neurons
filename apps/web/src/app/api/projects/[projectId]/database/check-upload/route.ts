/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { checkDatabaseUploadConflictsForCurrentUser } from '@/lib/project-database/project-database-server';

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

  if (body == null || typeof body !== 'object') {
    return NextResponse.json(
      { ok: false, message: 'Invalid request body.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const databaseName = typeof b.databaseName === 'string' ? b.databaseName : '';
  const projectAgentIds = Array.isArray(b.projectAgentIds)
    ? b.projectAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];

  const result = await checkDatabaseUploadConflictsForCurrentUser(projectId, {
    databaseName,
    projectAgentIds,
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
