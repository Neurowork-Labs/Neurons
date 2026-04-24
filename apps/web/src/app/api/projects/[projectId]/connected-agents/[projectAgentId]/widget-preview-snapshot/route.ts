/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { createWidgetPreviewSnapshotForCurrentUser } from '@/lib/connected-agents/create-widget-preview-snapshot-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string; projectAgentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, projectAgentId } = await context.params;
  const result = await createWidgetPreviewSnapshotForCurrentUser({
    projectId,
    projectAgentId,
  });

  if (result.ok) {
    const copy = new ArrayBuffer(result.imageBytes.byteLength);
    new Uint8Array(copy).set(result.imageBytes);
    return new Response(copy, {
      status: 200,
      headers: {
        'content-type': result.contentType,
        'cache-control': 'no-store, max-age=0',
      },
    });
  }

  if (result.message === 'Unauthorized') {
    return new Response(result.message, { status: 401 });
  }
  if (result.code === 'FORBIDDEN') {
    return new Response(result.message, { status: 403 });
  }
  if (result.code === 'NOT_FOUND') {
    return new Response(result.message, { status: 404 });
  }
  if (result.code === 'NOT_CONFIGURED') {
    return new Response(result.message, { status: 503 });
  }
  if (result.code === 'BAD_REQUEST') {
    return new Response(result.message, { status: 400 });
  }

  return new Response(result.message, { status: 502 });
}
