/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { listProjectDatabaseSchemasForCurrentUser } from '@/lib/project-database/project-database-server';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const pageSize = url.searchParams.get('pageSize');
  const search = url.searchParams.get('search') ?? undefined;
  const fetchAll = url.searchParams.get('all') === '1';

  const result = await listProjectDatabaseSchemasForCurrentUser(projectId, {
    page: page != null ? Number(page) : undefined,
    pageSize: pageSize != null ? Number(pageSize) : undefined,
    search,
    fetchAll,
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

