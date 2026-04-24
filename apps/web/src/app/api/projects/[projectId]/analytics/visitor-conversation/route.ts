import { NextResponse } from 'next/server';

import { getProjectAnalyticsVisitorConversationForCurrentUser } from '@/lib/project-analytics/get-project-analytics-visitor-conversation';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const { searchParams } = new URL(request.url);
  const projectAgentId = String(searchParams.get('projectAgentId') ?? '');
  const visitorContactId = String(searchParams.get('visitorContactId') ?? '');

  const result = await getProjectAnalyticsVisitorConversationForCurrentUser({
    projectId,
    projectAgentId,
    visitorContactId,
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  return NextResponse.json(result, { status: 400 });
}
