/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { uploadProjectStorageDocumentForCurrentUser } from '@/lib/storage/upload-project-storage-document-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid form data.' }, { status: 400 });
  }

  const file = form.get('file');
  const keepExistingRaw = form.get('keepExisting');
  const projectAgentIdsRaw = form.get('projectAgentIds');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: 'Missing file upload.' }, { status: 400 });
  }

  const keepExisting = keepExistingRaw === 'true' || keepExistingRaw === '1';
  let projectAgentIds: string[] = [];
  try {
    const parsed = JSON.parse(String(projectAgentIdsRaw ?? '[]'));
    if (Array.isArray(parsed)) {
      projectAgentIds = parsed.map((v) => String(v));
    }
  } catch {
    projectAgentIds = [];
  }

  const result = await uploadProjectStorageDocumentForCurrentUser(projectId, {
    file,
    keepExisting,
    projectAgentIds,
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'UNAUTHORIZED') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'QUOTA_EXCEEDED') {
    return NextResponse.json(result, { status: 409 });
  }

  const status = result.code === 'BAD_REQUEST' ? 400 : 400;
  return NextResponse.json(result, { status });
}

