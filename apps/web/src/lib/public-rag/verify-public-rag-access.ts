/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { verifyPublicRagPreviewToken } from '@/lib/public-rag/public-rag-preview-token';
import {
  type VerifyPublicRagRequestResult,
  verifyPublicRagRequest,
} from '@/lib/public-rag/verify-public-rag-request';

export type VerifyPublicRagAccessResult =
  | {
      ok: true;
      projectId: string;
      organizationId: string;
      projectDomain: string | null;
      mode: 'public' | 'preview';
    }
  | { ok: false; status: number; message: string };

export async function verifyPublicRagAccess(input: {
  apiKey: string | null | undefined;
  origin: string | null | undefined;
  previewToken: string | null | undefined;
  projectAgentId: string | null | undefined;
}): Promise<VerifyPublicRagAccessResult> {
  const previewToken = String(input.previewToken ?? '').trim();
  if (previewToken) {
    const v = verifyPublicRagPreviewToken(previewToken);
    if (!v.ok) {
      return { ok: false, status: 403, message: v.message };
    }

    const projectAgentId = String(input.projectAgentId ?? '').trim();
    if (projectAgentId && projectAgentId !== v.projectAgentId) {
      return {
        ok: false,
        status: 403,
        message: 'Preview token does not match the selected project agent.',
      };
    }

    return {
      ok: true,
      projectId: v.projectId,
      organizationId: v.organizationId,
      projectDomain: null,
      mode: 'preview',
    };
  }

  const standardResult: VerifyPublicRagRequestResult = await verifyPublicRagRequest(
    input.apiKey,
    input.origin,
  );
  if (!standardResult.ok) return standardResult;
  return { ...standardResult, projectDomain: standardResult.projectDomain, mode: 'public' };
}
