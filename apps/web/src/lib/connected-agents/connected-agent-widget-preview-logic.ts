/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { useEffect, useMemo, useState } from 'react';

import {
  createWidgetPreviewSessionViaApi,
  type WidgetPreviewSessionApiResult,
} from '@/lib/connected-agents/connected-agents-api-client';
import { ensureWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';

type PreviewTheme = 'light' | 'dark';

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function encodeGreetingForAttr(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
}

function detectAppTheme(): PreviewTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function buildWidgetPreviewSrcDoc(input: {
  widgetScriptSrc: string;
  previewToken: string;
  projectAgentId: string;
  snapshotImageUrl: string;
  projectName: string;
  agentName: string;
  defaultGreetings: string | null;
  widgetThemeColor: string;
  projectWebsiteUrl: string | null;
  theme: PreviewTheme;
}): string {
  const greeting = String(input.defaultGreetings ?? '').trim();
  const greetingAttr = greeting
    ? `\n      data-default-greetings="${escapeAttr(encodeGreetingForAttr(greeting))}"`
    : '';
  const themeMode = input.theme;
  const isDark = themeMode === 'dark';
  const bgColor = isDark
    ? 'radial-gradient(120% 95% at 50% 6%, rgba(148,163,184,0.12) 0%, rgba(23,23,23,1) 62%), linear-gradient(180deg, #1b1b1b 0%, #111315 100%)'
    : 'radial-gradient(120% 95% at 50% 6%, rgba(121,85,50,0.16) 0%, rgba(245,246,248,1) 62%), linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)';
  const labelColor = isDark ? 'rgba(226,232,240,0.82)' : 'rgba(30,41,59,0.74)';
  const websiteUrl = String(input.projectWebsiteUrl ?? '').trim();
  const hasWebsiteUrl = websiteUrl.length > 0;
  const snapshotImageUrl = String(input.snapshotImageUrl ?? '').trim();
  const snapshotLayer = hasWebsiteUrl
    ? '<img id="ae-preview-snapshot" class="preview-snapshot" alt="Website preview snapshot fallback" loading="eager" />'
    : '';
  const previewLoader =
    '<div id="ae-preview-loader" class="preview-loader"><span class="preview-loader-spinner" aria-hidden="true"></span><span class="preview-loader-text">Loading live website preview...</span></div>';
  const previewLabel =
    '<div id="ae-preview-fallback-label" class="preview-label">YOUR WEBSITE HERE</div>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.projectName || 'Neurons')} - Widget Preview</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root { color-scheme: ${themeMode}; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        height: 100vh;
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
        background: ${bgColor};
        overflow: hidden;
      }
      .preview-loader {
        position: fixed;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: ${labelColor};
        background: transparent;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: .01em;
      }
      .preview-loader-spinner {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid ${isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)'};
        border-top-color: ${isDark ? 'rgba(226,232,240,0.9)' : 'rgba(30,41,59,0.9)'};
        animation: ae-preview-spin 1s linear infinite;
      }
      @keyframes ae-preview-spin {
        to { transform: rotate(360deg); }
      }
      .preview-snapshot {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border: 0;
        display: none;
        background: ${isDark ? '#0f172a' : '#f8fafc'};
      }
      .preview-label {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: .22em;
        text-transform: uppercase;
        color: ${labelColor};
        user-select: none;
        pointer-events: none;
        display: none;
      }
    </style>
  </head>
  <body>
    ${previewLoader}
    ${snapshotLayer}
    ${previewLabel}
    <script>
      (function () {
        try {
          localStorage.setItem('ae_rag_theme', '${themeMode}');
        } catch (e) {
          /* ignore */
        }
      })();

      (function () {
        var hasWebsite = ${hasWebsiteUrl ? 'true' : 'false'};
        var snapshot = document.getElementById('ae-preview-snapshot');
        var fallbackLabel = document.getElementById('ae-preview-fallback-label');
        var loader = document.getElementById('ae-preview-loader');
        var snapshotUrl = '${escapeAttr(snapshotImageUrl)}';
        if (!fallbackLabel) return;

        function hideLoader() {
          if (loader) loader.style.display = 'none';
        }

        if (!hasWebsite || !snapshot || !snapshotUrl) {
          hideLoader();
          fallbackLabel.style.display = 'block';
          return;
        }

        function showLabelFallback() {
          hideLoader();
          if (snapshot) snapshot.style.display = 'none';
          fallbackLabel.style.display = 'block';
        }

        function showSnapshotPreview() {
          hideLoader();
          fallbackLabel.style.display = 'none';
          snapshot.style.display = 'block';
        }

        snapshot.addEventListener('error', function () {
          showLabelFallback();
        });

        snapshot.addEventListener('load', function () {
          showSnapshotPreview();
        });

        var sep = snapshotUrl.indexOf('?') >= 0 ? '&' : '?';
        snapshot.src = snapshotUrl + sep + 't=' + Date.now();
        window.setTimeout(function () {
          if (snapshot && snapshot.style.display !== 'block') {
            showLabelFallback();
          }
        }, 12000);
      })();
    </script>
    <script
      src="${escapeAttr(input.widgetScriptSrc)}"
      data-preview-token="${escapeAttr(input.previewToken)}"
      data-project-agent-id="${escapeAttr(input.projectAgentId)}"
      data-primary-color="${escapeAttr(ensureWidgetThemeColor(input.widgetThemeColor))}"
      data-agent-name="${escapeAttr(input.agentName || 'Agent')}"${greetingAttr}
      async
    ></script>
  </body>
</html>`;
}

export type ConnectedAgentWidgetPreviewState = {
  loading: boolean;
  error: string | null;
  srcDoc: string;
  session: Extract<WidgetPreviewSessionApiResult, { ok: true }> | null;
};

export function useConnectedAgentWidgetPreview(input: {
  projectId: string;
  projectAgentId: string;
}): ConnectedAgentWidgetPreviewState {
  const projectId = String(input.projectId ?? '').trim();
  const projectAgentId = String(input.projectAgentId ?? '').trim();
  const snapshotImageUrl =
    projectId && projectAgentId
      ? `/api/projects/${encodeURIComponent(projectId)}/connected-agents/${encodeURIComponent(projectAgentId)}/widget-preview-snapshot`
      : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Extract<WidgetPreviewSessionApiResult, { ok: true }> | null>(null);
  const [theme, setTheme] = useState<PreviewTheme>(() => detectAppTheme());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(detectAppTheme());
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!projectId || !projectAgentId) {
        if (!active) return;
        setError('Missing project agent id for preview.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const res = await createWidgetPreviewSessionViaApi(projectId, projectAgentId);
      if (!active) return;
      if (!res.ok) {
        setError(res.message || 'Could not start widget preview.');
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(res);
      setLoading(false);
    }

    void run();
    return () => {
      active = false;
    };
  }, [projectId, projectAgentId]);

  const srcDoc = useMemo(() => {
    if (!session) return '';
    return buildWidgetPreviewSrcDoc({
      widgetScriptSrc: session.widgetScriptSrc,
      previewToken: session.previewToken,
      projectAgentId: session.projectAgentId,
      snapshotImageUrl,
      projectName: session.projectName,
      agentName: session.agentName,
      defaultGreetings: session.defaultGreetings,
      widgetThemeColor: session.widgetThemeColor,
      projectWebsiteUrl: session.projectWebsiteUrl,
      theme,
    });
  }, [session, theme, snapshotImageUrl]);

  return { loading, error, srcDoc, session };
}
