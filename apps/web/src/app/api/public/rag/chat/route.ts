/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { NextResponse } from 'next/server';

import { runPublicRagChat } from '@/lib/public-rag/public-rag-chat';
import { verifyPublicRagAccess } from '@/lib/public-rag/verify-public-rag-access';
import { isSupabaseServiceRoleConfigured } from '@/lib/supabase/service-role';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;
const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const;

/**
 * Reflects `Origin` so cross-origin browsers can read error JSON (verify failures, 500, etc.).
 * Without this, `fetch` rejects with "Failed to fetch" even though the server returned a body.
 */
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

/** Preflight: do not require API key (browser may omit it on OPTIONS). */
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

  const wantsStream = Boolean(body.stream);

  const payload = {
    projectAgentId,
    message: String(body.message ?? ''),
    visitorId: String(body.visitorId ?? ''),
    sessionId: String(body.sessionId ?? ''),
    conversationId: body.conversationId != null ? String(body.conversationId) : null,
    pageUrl: body.pageUrl != null ? String(body.pageUrl) : null,
  };

  const cors = corsHeadersForRequest(request, v.projectDomain);

  if (wantsStream) {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send('start', { ok: true });
          const result = await runPublicRagChat(
            { projectId: v.projectId, organizationId: v.organizationId },
            payload,
            {
              onReplyDelta: (delta) => {
                send('delta', { text: delta });
              },
              onPhase: (name) => {
                send('phase', { name });
              },
            },
          );
          if (!result.ok) {
            send('error', { ok: false, message: result.message, code: result.code ?? null });
            return;
          }
          send('done', {
            ok: true,
            reply: result.reply,
            conversationId: result.conversationId,
            visitorId: result.visitorId,
            sessionId: result.sessionId,
            sources: result.sources,
            route: result.route,
            sql: result.sql,
            suggestions: result.suggestions,
            cards: result.cards,
            projectName: result.projectName,
            greeting: result.greeting,
          });
        } catch (e) {
          const message =
            e instanceof Error && e.message
              ? e.message
              : "We're experiencing a temporary technical issue. Please try again in a moment.";
          send('error', { ok: false, message });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { ...SSE_HEADERS, ...cors },
    });
  }

  const result = await runPublicRagChat(
    { projectId: v.projectId, organizationId: v.organizationId },
    payload,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, code: result.code },
      { status: result.code === 'BAD_REQUEST' ? 400 : 400, headers: { ...JSON_HEADERS, ...cors } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      reply: result.reply,
      conversationId: result.conversationId,
      visitorId: result.visitorId,
      sessionId: result.sessionId,
      sources: result.sources,
      route: result.route,
      sql: result.sql,
      suggestions: result.suggestions,
      cards: result.cards,
      projectName: result.projectName,
      greeting: result.greeting,
    },
    { status: 200, headers: { ...JSON_HEADERS, ...cors } },
  );
}
