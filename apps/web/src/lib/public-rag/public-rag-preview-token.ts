/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const PREVIEW_TOKEN_TTL_SECONDS = 10 * 60;

type PreviewTokenPayload = {
  v: string;
  typ: 'rag_widget_preview';
  projectId: string;
  organizationId: string;
  projectAgentId: string;
  userId: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? `${normalized}${'='.repeat(4 - pad)}` : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function tokenSecret(): string {
  return String(
    process.env.RAG_WIDGET_PREVIEW_SECRET ??
      process.env.RAG_AGENT_INTERNAL_SECRET ??
      '',
  ).trim();
}

function sign(unsignedToken: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function secureEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export type IssuePreviewTokenResult =
  | { ok: true; token: string; expiresAtUnix: number }
  | { ok: false; message: string };

export function issuePublicRagPreviewToken(input: {
  projectId: string;
  organizationId: string;
  projectAgentId: string;
  userId: string;
  ttlSeconds?: number;
}): IssuePreviewTokenResult {
  const secret = tokenSecret();
  if (!secret) {
    return {
      ok: false,
      message:
        'Preview token secret is not configured. Set RAG_WIDGET_PREVIEW_SECRET (or RAG_AGENT_INTERNAL_SECRET).',
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.min(60 * 60, Number(input.ttlSeconds ?? PREVIEW_TOKEN_TTL_SECONDS)));
  const payload: PreviewTokenPayload = {
    v: TOKEN_VERSION,
    typ: 'rag_widget_preview',
    projectId: String(input.projectId ?? '').trim(),
    organizationId: String(input.organizationId ?? '').trim(),
    projectAgentId: String(input.projectAgentId ?? '').trim(),
    userId: String(input.userId ?? '').trim(),
    iat: now,
    exp: now + ttl,
  };

  if (!payload.projectId || !payload.organizationId || !payload.projectAgentId || !payload.userId) {
    return { ok: false, message: 'Missing preview token payload fields.' };
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${TOKEN_VERSION}.${encodedPayload}`;
  const signature = sign(unsignedToken, secret);
  return { ok: true, token: `${unsignedToken}.${signature}`, expiresAtUnix: payload.exp };
}

export type VerifyPreviewTokenResult =
  | {
      ok: true;
      projectId: string;
      organizationId: string;
      projectAgentId: string;
      userId: string;
      expiresAtUnix: number;
    }
  | { ok: false; message: string };

export function verifyPublicRagPreviewToken(rawToken: string | null | undefined): VerifyPreviewTokenResult {
  const token = String(rawToken ?? '').trim();
  if (!token) return { ok: false, message: 'Missing preview token.' };

  const secret = tokenSecret();
  if (!secret) return { ok: false, message: 'Preview token secret is not configured.' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, message: 'Invalid preview token format.' };

  const version = parts[0] ?? '';
  const payloadPart = parts[1] ?? '';
  const signaturePart = parts[2] ?? '';
  if (version !== TOKEN_VERSION || !payloadPart || !signaturePart) {
    return { ok: false, message: 'Invalid preview token.' };
  }

  const unsignedToken = `${version}.${payloadPart}`;
  const expectedSignature = sign(unsignedToken, secret);
  if (!secureEquals(signaturePart, expectedSignature)) {
    return { ok: false, message: 'Invalid preview token signature.' };
  }

  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart)) as PreviewTokenPayload;
  } catch {
    return { ok: false, message: 'Invalid preview token payload.' };
  }

  if (
    payload?.typ !== 'rag_widget_preview' ||
    payload?.v !== TOKEN_VERSION ||
    !payload.projectId ||
    !payload.organizationId ||
    !payload.projectAgentId ||
    !payload.userId
  ) {
    return { ok: false, message: 'Malformed preview token payload.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    return { ok: false, message: 'Preview token expired.' };
  }

  return {
    ok: true,
    projectId: payload.projectId,
    organizationId: payload.organizationId,
    projectAgentId: payload.projectAgentId,
    userId: payload.userId,
    expiresAtUnix: payload.exp,
  };
}
