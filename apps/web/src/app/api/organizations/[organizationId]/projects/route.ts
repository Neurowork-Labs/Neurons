/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextRequest, NextResponse } from 'next/server';

import { createOrganizationProject } from '@/lib/organizations/create-organization-project';
import { listOrganizationProjectsForCurrentUser } from '@/lib/organizations/list-organization-projects-for-current-user';
import type { CreateOrganizationProjectPayload } from '@/lib/organizations/organization-types';

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  if (!organizationId?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'Missing organization id.' },
      { status: 400 },
    );
  }

  const result = await listOrganizationProjectsForCurrentUser(organizationId);

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

async function parseCreateProjectBody(
  request: NextRequest,
): Promise<CreateOrganizationProjectPayload> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      title: String(body.title ?? ''),
      domain: body.domain != null ? String(body.domain) : undefined,
      description:
        body.description != null ? String(body.description) : undefined,
    };
  }

  const formData = await request.formData();
  return {
    title: String(formData.get('title') ?? ''),
    domain: String(formData.get('domain') ?? '') || undefined,
    description: String(formData.get('description') ?? '') || undefined,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { organizationId } = await context.params;
  if (!organizationId?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'Missing organization id.' },
      { status: 400 },
    );
  }

  const payload = await parseCreateProjectBody(request);
  const result = await createOrganizationProject(organizationId, payload);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'PROJECT_LIMIT') {
    return NextResponse.json(result, { status: 403 });
  }
  if (result.code === 'ORG_INACTIVE') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  if (result.code === 'DUPLICATE_DOMAIN' || result.code === 'DUPLICATE_PROJECT') {
    return NextResponse.json(result, { status: 409 });
  }

  if (
    result.code === 'DOMAIN_REQUIRED' ||
    result.code === 'INVALID_DOMAIN'
  ) {
    return NextResponse.json(result, { status: 400 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}
