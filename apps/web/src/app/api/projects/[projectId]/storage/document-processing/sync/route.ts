/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { NextResponse } from 'next/server';

import { syncDocumentProcessingJobsForProject } from '@/lib/document-processing/sync-document-jobs-for-project';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await syncDocumentProcessingJobsForProject(projectId);
  if (!result.ok) {
    const status =
      result.code === 'UNAUTHORIZED'
        ? 401
        : result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }
  return NextResponse.json({ ok: true, updatedDocuments: result.updatedDocuments });
}
