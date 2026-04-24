/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { connectPublicAgentToProjectForCurrentUser } from '@/lib/projects/connect-public-agent-to-project';
import { disconnectProjectAgentForCurrentUser } from '@/lib/projects/disconnect-project-agent';
import { listProjectConnectedAgentsForCurrentUser } from '@/lib/projects/list-project-connected-agents';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await listProjectConnectedAgentsForCurrentUser(projectId);

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

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  let body: { agentId?: string };
  try {
    body = (await request.json()) as { agentId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const agentId = body.agentId != null ? String(body.agentId) : '';
  const result = await connectPublicAgentToProjectForCurrentUser(projectId, agentId);

  if (result.ok) {
    return NextResponse.json(result, { status: 201 });
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

  if (result.code === 'ALREADY_CONNECTED') {
    return NextResponse.json(result, { status: 409 });
  }

  if (result.code === 'AGENT_NOT_AVAILABLE') {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result, { status: 400 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  let body: { agentId?: string };
  try {
    body = (await request.json()) as { agentId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const agentId = body.agentId != null ? String(body.agentId) : '';
  const result = await disconnectProjectAgentForCurrentUser(projectId, agentId);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.message === 'Unauthorized') {
    return NextResponse.json(result, { status: 401 });
  }

  if (result.code === 'BAD_REQUEST') {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.code === 'NOT_FOUND' || result.code === 'NOT_CONNECTED') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.code === 'FORBIDDEN') {
    return NextResponse.json(result, { status: 403 });
  }

  return NextResponse.json(result, { status: 400 });
}
