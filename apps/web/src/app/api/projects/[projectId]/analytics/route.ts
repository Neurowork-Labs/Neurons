import { NextResponse } from 'next/server';

import { listProjectAnalyticsFiltersForCurrentUser } from '@/lib/project-analytics/list-project-analytics-filters';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await listProjectAnalyticsFiltersForCurrentUser(projectId);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  return NextResponse.json(result, { status: 400 });
}
