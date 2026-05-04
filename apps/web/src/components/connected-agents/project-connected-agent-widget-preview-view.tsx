/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

'use client';

import { useConnectedAgentWidgetPreview } from '@/lib/connected-agents/connected-agent-widget-preview-logic';

type ProjectConnectedAgentWidgetPreviewViewProps = {
  projectId: string;
  projectAgentId: string;
};

export function ProjectConnectedAgentWidgetPreviewView({
  projectId,
  projectAgentId,
}: ProjectConnectedAgentWidgetPreviewViewProps) {
  const { loading, error, srcDoc, session } = useConnectedAgentWidgetPreview({ projectId, projectAgentId });
  const previewTitle = `${(session?.agentName?.trim() || 'Agent')} Widget Preview`;

  return (
    <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-6 pt-8 sm:px-6 sm:pt-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          {previewTitle}
        </h1>
      </div>

      {loading ? (
        <p className="rounded-lg border border-transparent bg-transparent px-0 py-1 text-sm text-neutral-500 dark:text-neutral-400">
          Preparing preview session...
        </p>
      ) : null}

      {!loading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {!loading && !error && srcDoc ? (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <iframe
            title={previewTitle}
            srcDoc={srcDoc}
            className="h-[calc(100vh-12rem)] min-h-[36rem] w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      ) : null}
    </main>
  );
}
