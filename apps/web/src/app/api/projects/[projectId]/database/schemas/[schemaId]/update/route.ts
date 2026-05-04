/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { updateDatabaseSchemaFilesForCurrentUser } from '@/lib/project-database/project-database-server';

type RouteContext = {
  params: Promise<{ projectId: string; schemaId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, schemaId } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid form data.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const schemaFile = form.get('schemaFile');
  const dataFile = form.get('dataFile');

  if (!(schemaFile instanceof File) || !(dataFile instanceof File)) {
    return NextResponse.json(
      { ok: false, message: 'Missing files.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const result = await updateDatabaseSchemaFilesForCurrentUser(projectId, schemaId, {
    schemaFile,
    dataFile,
  });

  if (result.ok) return NextResponse.json(result, { status: 200 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}
