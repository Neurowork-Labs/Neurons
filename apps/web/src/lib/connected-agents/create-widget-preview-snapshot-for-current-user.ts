/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { createWidgetPreviewSessionForCurrentUser } from '@/lib/connected-agents/create-widget-preview-session-for-current-user';

type SnapshotFailureCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'CAPTURE_FAILED';

export type CreateWidgetPreviewSnapshotResult =
  | {
      ok: true;
      contentType: 'image/png';
      imageBytes: Buffer;
    }
  | {
      ok: false;
      message: string;
      code: SnapshotFailureCode;
    };

const PREVIEW_CAPTURE_VIEWPORT = { width: 1366, height: 768 };
const PREVIEW_CAPTURE_TIMEOUT_MS = 20_000;
const PREVIEW_POST_LOAD_WAIT_MS = 1200;

type PageLike = {
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  screenshot: (opts: { type: 'png'; fullPage: boolean }) => Promise<Buffer>;
};

type ContextLike = {
  newPage: () => Promise<PageLike>;
};

type BrowserLike = {
  newContext: (opts: { viewport: typeof PREVIEW_CAPTURE_VIEWPORT }) => Promise<ContextLike>;
  close: () => Promise<void>;
};

type ChromiumLike = {
  launch: (opts: { headless: boolean; args: string[] }) => Promise<BrowserLike>;
};

type PlaywrightModuleLike = {
  chromium?: ChromiumLike;
};

export async function createWidgetPreviewSnapshotForCurrentUser(input: {
  projectId: string;
  projectAgentId: string;
}): Promise<CreateWidgetPreviewSnapshotResult> {
  const session = await createWidgetPreviewSessionForCurrentUser(input);
  if (!session.ok) {
    return {
      ok: false,
      message: session.message,
      code: session.code ?? 'BAD_REQUEST',
    };
  }

  const targetUrl = String(session.projectWebsiteUrl ?? '').trim();
  if (!targetUrl) {
    return {
      ok: false,
      message: 'Project website URL is not configured or verified.',
      code: 'BAD_REQUEST',
    };
  }

  // Keep Playwright optional so app can run without the package installed.
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<unknown>;

  let playwrightModule: PlaywrightModuleLike | null = null;
  try {
    playwrightModule = (await dynamicImport('playwright')) as PlaywrightModuleLike;
  } catch {
    return {
      ok: false,
      message:
        'Playwright is not installed. Install it in apps/web to enable snapshot fallback.',
      code: 'NOT_CONFIGURED',
    };
  }

  const chromium = playwrightModule?.chromium;
  if (!chromium) {
    return {
      ok: false,
      message: 'Playwright chromium runtime is unavailable.',
      code: 'NOT_CONFIGURED',
    };
  }

  let browser: BrowserLike | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser!.newContext({
      viewport: PREVIEW_CAPTURE_VIEWPORT,
    });
    const page = await context.newPage();
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PREVIEW_CAPTURE_TIMEOUT_MS,
    });
    await page.waitForTimeout(PREVIEW_POST_LOAD_WAIT_MS);
    const image = await page.screenshot({
      type: 'png',
      fullPage: false,
    });
    return {
      ok: true,
      contentType: 'image/png',
      imageBytes: image,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Could not capture website preview snapshot.';
    return {
      ok: false,
      message,
      code: 'CAPTURE_FAILED',
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      // ignore close errors
    }
  }
}
