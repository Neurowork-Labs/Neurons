/*
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { uploadWidgetIconForCurrentUser } from '@/lib/connected-agents/upload-widget-icon';

type RouteContext = {
  params: Promise<{ projectId: string; projectAgentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, projectAgentId } = await context.params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid form data.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, message: 'Missing or empty icon file.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await uploadWidgetIconForCurrentUser(projectId, projectAgentId, file);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }
  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }
  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result, { status: 400 });
}
