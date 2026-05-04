/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import {
  createProjectApiKeyForCurrentUser,
  listProjectApiKeysForCurrentUser,
} from '@/lib/project-api-keys/project-api-keys-server';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const pageSize = url.searchParams.get('pageSize');
  const search = url.searchParams.get('search') ?? undefined;

  const result = await listProjectApiKeysForCurrentUser(projectId, {
    page: page != null ? Number(page) : undefined,
    pageSize: pageSize != null ? Number(pageSize) : undefined,
    search,
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  return NextResponse.json(result, { status: 400 });
}

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
  const name = b.name;
  const confirmDeactivateOtherActiveKeys = b.confirmDeactivateOtherActiveKeys === true;

  let expiresAtValue: string | null = null;
  if (b.expiresAt === undefined || b.expiresAt === null) {
    expiresAtValue = null;
  } else if (typeof b.expiresAt === 'string') {
    expiresAtValue = b.expiresAt;
  } else {
    return NextResponse.json(
      { ok: false, message: 'Invalid expiresAt.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const result = await createProjectApiKeyForCurrentUser(projectId, {
    name: typeof name === 'string' ? name : '',
    expiresAt: expiresAtValue,
    confirmDeactivateOtherActiveKeys,
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 201 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'ACTIVE_KEY_EXISTS') {
    return NextResponse.json(result, { status: 409 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, { status: 400 });
}
