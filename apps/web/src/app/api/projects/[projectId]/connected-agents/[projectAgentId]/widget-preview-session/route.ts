/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { NextResponse } from 'next/server';

import { createWidgetPreviewSessionForCurrentUser } from '@/lib/connected-agents/create-widget-preview-session-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string; projectAgentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { projectId, projectAgentId } = await context.params;
  const result = await createWidgetPreviewSessionForCurrentUser({ projectId, projectAgentId });

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
