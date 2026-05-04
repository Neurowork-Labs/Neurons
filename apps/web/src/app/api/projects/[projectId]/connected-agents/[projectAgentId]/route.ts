/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { updateProjectConnectedAgentForCurrentUser } from '@/lib/projects/update-project-connected-agent';

type RouteContext = {
  params: Promise<{ projectId: string; projectAgentId: string }>;
};

type PatchPayload = {
  statusId?: string;
  modelId?: string | null;
  userInstruction?: string | null;
  greeting?: string | null;
  customAgentName?: string | null;
  config?: unknown | null;
  widgetLauncherIcon?: {
    mode?: unknown;
    lucideIcon?: unknown;
    customIconUrl?: unknown;
  } | null;
  widgetThemeColor?: unknown;
  requiredContactFields?: unknown;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, projectAgentId } = await context.params;
  let body: PatchPayload;
  try {
    body = (await request.json()) as PatchPayload;
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await updateProjectConnectedAgentForCurrentUser({
    projectId,
    projectAgentId,
    statusId: body.statusId != null ? String(body.statusId) : '',
    modelId: body.modelId != null ? String(body.modelId) : null,
    userInstruction:
      typeof body.userInstruction === 'string' ? body.userInstruction : body.userInstruction ?? null,
    greeting: typeof body.greeting === 'string' ? body.greeting : body.greeting ?? null,
    customAgentName:
      typeof body.customAgentName === 'string' ? body.customAgentName : body.customAgentName ?? null,
    config: body.config ?? null,
    widgetLauncherIcon: body.widgetLauncherIcon ?? null,
    widgetThemeColor: body.widgetThemeColor ?? null,
    requiredContactFields: body.requiredContactFields ?? null,
  });

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

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, { status: 400 });
}
