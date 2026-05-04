/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { softDeleteProjectForCurrentUser } from '@/lib/project-settings/project-settings-server';

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
      { ok: false, message: 'Invalid JSON body.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const confirmProjectTitle =
    body != null &&
    typeof body === 'object' &&
    'confirmProjectTitle' in body &&
    typeof (body as { confirmProjectTitle: unknown }).confirmProjectTitle === 'string'
      ? (body as { confirmProjectTitle: string }).confirmProjectTitle
      : null;

  if (confirmProjectTitle == null) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Field "confirmProjectTitle" (string) is required.',
        code: 'BAD_REQUEST',
      },
      { status: 400 },
    );
  }

  const result = await softDeleteProjectForCurrentUser(projectId, confirmProjectTitle);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.code === 'TITLE_MISMATCH') {
    return NextResponse.json(result, { status: 422 });
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
