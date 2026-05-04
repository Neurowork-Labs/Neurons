/*
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import {
  deleteProjectStorageDocumentForCurrentUser,
  renameProjectStorageDocumentForCurrentUser,
} from '@/lib/storage/update-project-storage-document-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  let body: { fileName?: string };

  try {
    body = (await request.json()) as { fileName?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await renameProjectStorageDocumentForCurrentUser(projectId, documentId, {
    fileName: String(body.fileName ?? ''),
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result, { status: 400 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const result = await deleteProjectStorageDocumentForCurrentUser(projectId, documentId);

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result, { status: 400 });
}

