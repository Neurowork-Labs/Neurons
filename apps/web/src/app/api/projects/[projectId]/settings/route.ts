/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import {
  getProjectSettingsForCurrentUser,
  updateProjectSettingsForCurrentUser,
} from '@/lib/project-settings/project-settings-server';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await getProjectSettingsForCurrentUser(projectId);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const title =
    body != null && typeof body === 'object' && 'title' in body
      ? (body as { title: unknown }).title
      : undefined;
  const hasDescriptionKey =
    body != null && typeof body === 'object' && 'description' in body;
  const description = hasDescriptionKey
    ? (body as { description: unknown }).description
    : undefined;

  if (typeof title !== 'string') {
    return NextResponse.json(
      { ok: false, message: 'Field "title" must be a string.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  let descriptionArg: string | null | undefined;
  if (hasDescriptionKey) {
    if (description === null || description === undefined) {
      descriptionArg = null;
    } else if (typeof description === 'string') {
      descriptionArg = description;
    } else {
      return NextResponse.json(
        { ok: false, message: 'Field "description" must be a string or null.', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }
  }

  const result = await updateProjectSettingsForCurrentUser(projectId, {
    title,
    ...(descriptionArg !== undefined ? { description: descriptionArg } : {}),
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}
