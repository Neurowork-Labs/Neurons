/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { downloadProjectStorageDocumentForCurrentUser } from '@/lib/storage/download-project-storage-document-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string }>;
};

function attachmentContentDisposition(fileName: string): string {
  const ascii =
    fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const result = await downloadProjectStorageDocumentForCurrentUser(projectId, documentId);

  if (!result.ok) {
    const status =
      result.code === 'FORBIDDEN' ? 403 : result.code === 'NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': attachmentContentDisposition(result.fileName),
      'Cache-Control': 'private, no-store',
    },
  });
}
