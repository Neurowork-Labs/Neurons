/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import {
  deleteConnectionQueryTemplateForCurrentUser,
  updateConnectionQueryTemplateForCurrentUser,
} from '@/lib/database-connection/database-connection-query-templates-server';

type RouteContext = {
  params: Promise<{ projectId: string; connectionId: string; templateId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, connectionId, templateId } = await context.params;

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
  const queryBody =
    b.queryBody != null && typeof b.queryBody === 'object' && !Array.isArray(b.queryBody)
      ? (b.queryBody as Record<string, unknown>)
      : null;
  const cardConfig =
    b.cardConfig != null && typeof b.cardConfig === 'object' && !Array.isArray(b.cardConfig)
      ? (b.cardConfig as Record<string, unknown>)
      : null;
  const result = await updateConnectionQueryTemplateForCurrentUser(projectId, connectionId, templateId, {
    name: typeof b.name === 'string' ? b.name : '',
    description: typeof b.description === 'string' ? b.description : '',
    sqlText: typeof b.sqlText === 'string' ? b.sqlText : '',
    queryBody,
    parameterSchema:
      b.parameterSchema && typeof b.parameterSchema === 'object'
        ? (b.parameterSchema as Record<string, unknown>)
        : null,
    cardConfig: cardConfig as Parameters<typeof updateConnectionQueryTemplateForCurrentUser>[3]['cardConfig'],
    isActive: b.isActive === undefined ? true : b.isActive === true,
    sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : Number(b.sortOrder ?? 0),
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId, connectionId, templateId } = await context.params;
  const result = await deleteConnectionQueryTemplateForCurrentUser(projectId, connectionId, templateId);
  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'UNAUTHORIZED') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
