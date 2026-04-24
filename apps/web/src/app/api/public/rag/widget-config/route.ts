/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { NextResponse } from 'next/server';

import { getPublicRagWidgetConfig } from '@/lib/public-rag/public-rag-widget-config';
import { verifyPublicRagAccess } from '@/lib/public-rag/verify-public-rag-access';
import { isSupabaseServiceRoleConfigured } from '@/lib/supabase/service-role';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

function corsReflectOrigin(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-api-key, x-ae-preview-token, authorization',
  };
}

function corsHeadersForRequest(request: Request, projectDomain: string | null): HeadersInit {
  const origin = request.headers.get('origin');
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-api-key, x-ae-preview-token, authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && projectDomain) {
    try {
      const oh = new URL(origin).hostname.toLowerCase();
      const pd = projectDomain.replace(/^www\./, '').toLowerCase();
      const od = oh.replace(/^www\./, '');
      if (od === pd) {
        h['Access-Control-Allow-Origin'] = origin;
        h['Vary'] = 'Origin';
      }
    } catch {
      /* ignore */
    }
  }
  return h;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-api-key, x-ae-preview-token, authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, message: 'Server is not configured for public RAG.' },
      { status: 500, headers: { ...JSON_HEADERS, ...corsReflectOrigin(request) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.' },
      { status: 400, headers: { ...JSON_HEADERS, ...corsReflectOrigin(request) } },
    );
  }

  const projectAgentId = String(body.projectAgentId ?? '');
  const apiKey = request.headers.get('x-api-key');
  const origin = request.headers.get('origin');
  const previewToken = request.headers.get('x-ae-preview-token');
  const v = await verifyPublicRagAccess({
    apiKey,
    origin,
    previewToken,
    projectAgentId,
  });
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, message: v.message },
      { status: v.status, headers: { ...JSON_HEADERS, ...corsReflectOrigin(request) } },
    );
  }

  const result = await getPublicRagWidgetConfig(
    { projectId: v.projectId },
    { projectAgentId },
  );
  const cors = corsHeadersForRequest(request, v.projectDomain);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, code: result.code },
      { status: result.code === 'BAD_REQUEST' ? 400 : 400, headers: { ...JSON_HEADERS, ...cors } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      launcherIcon: result.launcherIcon,
      requiredContactFields: result.requiredContactFields,
      greeting: result.greeting,
      widgetThemeColor: result.widgetThemeColor,
      agentName: result.agentName,
    },
    { status: 200, headers: { ...JSON_HEADERS, ...cors } },
  );
}
