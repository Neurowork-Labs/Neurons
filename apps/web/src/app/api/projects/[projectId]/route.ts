/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { getProjectContextForCurrentUser } from '@/lib/projects/get-project-for-current-user';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await getProjectContextForCurrentUser(projectId);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'NOT_FOUND') {
    return NextResponse.json(result, { status: 404 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}
