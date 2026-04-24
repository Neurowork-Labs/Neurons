/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { uploadProjectDatabaseFilesForCurrentUser } from '@/lib/project-database/project-database-server';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid form data.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const databaseTypeId = String(form.get('databaseTypeId') ?? '').trim();
  const databaseId = String(form.get('databaseId') ?? '').trim();
  const databaseName = String(form.get('databaseName') ?? '').trim();
  const databaseExportLayoutId = String(form.get('databaseExportLayoutId') ?? '').trim();
  const schemaFile = form.get('schemaFile');
  const dataFile = form.get('dataFile');

  if (!databaseTypeId || !databaseId || !databaseName || !databaseExportLayoutId) {
    return NextResponse.json(
      { ok: false, message: 'Missing required fields.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  if (!(schemaFile instanceof File) || !(dataFile instanceof File)) {
    return NextResponse.json(
      { ok: false, message: 'Missing files.', code: 'BAD_REQUEST' as const },
      { status: 400 },
    );
  }

  const projectAgentIds = form
    .getAll('projectAgentIds')
    .map((v) => String(v ?? '').trim())
    .filter((id) => id.length > 0);

  const result = await uploadProjectDatabaseFilesForCurrentUser({
    projectId,
    databaseTypeId,
    databaseId,
    databaseName,
    databaseExportLayoutId,
    projectAgentIds,
    schemaFile,
    dataFile,
  });

  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.message === 'Unauthorized') return NextResponse.json(result, { status: 401 });
  if (result.code === 'NOT_FOUND') return NextResponse.json(result, { status: 404 });
  if (result.code === 'FORBIDDEN') return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 400 });
}

