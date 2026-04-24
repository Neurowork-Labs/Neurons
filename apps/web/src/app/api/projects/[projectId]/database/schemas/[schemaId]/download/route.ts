/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { downloadDatabaseSchemaZipForCurrentUser } from '@/lib/project-database/project-database-server';

type RouteContext = {
  params: Promise<{ projectId: string; schemaId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, schemaId } = await context.params;

  const result = await downloadDatabaseSchemaZipForCurrentUser(projectId, schemaId);

  if (result.ok) {
    return new NextResponse(new Uint8Array(result.body), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.fileName.replace(/"/g, '')}"`,
      },
    });
  }
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
