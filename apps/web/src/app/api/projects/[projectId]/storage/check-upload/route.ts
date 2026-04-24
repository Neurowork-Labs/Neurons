/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { checkProjectStorageUploadConflictForCurrentUser } from '@/lib/storage/check-project-storage-upload-conflict-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const fileName = url.searchParams.get('fileName') ?? '';
  const fileSizeBytes = Number(url.searchParams.get('fileSizeBytes') ?? 0);
  const projectAgentIdsRaw = url.searchParams.get('projectAgentIds') ?? '';
  const projectAgentIds = projectAgentIdsRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const result = await checkProjectStorageUploadConflictForCurrentUser(projectId, {
    fileName,
    fileSizeBytes,
    projectAgentIds,
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}

