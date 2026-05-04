/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextRequest, NextResponse } from 'next/server';

import { createOrganization } from '@/lib/organizations/create-organization';
import { listOrganizationsForCurrentUser } from '@/lib/organizations/list-organizations-for-current-user';
import type { CreateOrganizationPayload } from '@/lib/organizations/organization-types';

export async function GET() {
  const result = await listOrganizationsForCurrentUser();
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}

async function parseCreateBody(request: NextRequest): Promise<CreateOrganizationPayload> {
  const contentType = request.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      name: String(body.name ?? ''),
      slug: body.slug != null ? String(body.slug) : undefined,
      planId: String(body.planId ?? ''),
      confirmPausePreviousFreeOrganizations: Boolean(
        body.confirmPausePreviousFreeOrganizations,
      ),
    };
  }

  const formData = await request.formData();

  return {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    planId: String(formData.get('planId') ?? ''),
    confirmPausePreviousFreeOrganizations:
      String(formData.get('confirmPausePreviousFreeOrganizations') ?? '') ===
      'true',
  };
}

export async function POST(request: NextRequest) {
  const payload = await parseCreateBody(request);
  const result = await createOrganization(payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
