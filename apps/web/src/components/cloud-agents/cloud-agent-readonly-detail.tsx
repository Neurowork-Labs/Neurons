/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ReactNode } from 'react';

import type { CloudAgentCatalogItem } from '@/lib/cloud-agents/cloud-agents-types';
import {
  formatAgentTimestamp,
  stringifyConfigSchemaForDisplay,
} from '@/lib/cloud-agents/cloud-agent-detail-format';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1.5 min-w-0 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
        {children}
      </dd>
    </div>
  );
}

type CloudAgentReadonlyDetailProps = {
  agent: CloudAgentCatalogItem;
};

export function CloudAgentReadonlyDetail({ agent }: CloudAgentReadonlyDetailProps) {
  const configText = stringifyConfigSchemaForDisplay(agent.configSchema);

  return (
    <dl className="space-y-5 pr-1">
      <DetailRow label="Agent type">{agent.typeDisplayName}</DetailRow>
      <DetailRow label="Default model">{agent.defaultModelDisplayName}</DetailRow>
      <DetailRow label="Description">
        <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">
          {agent.description?.trim() ? agent.description : '—'}
        </div>
      </DetailRow>
      <DetailRow label="System instruction">
        <pre className="max-h-[min(32vh,18rem)] min-h-[6rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-relaxed text-neutral-800 scrollbar-dialog dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
          {agent.systemInstruction}
        </pre>
      </DetailRow>
      <DetailRow label="Config schema">
        <pre className="max-h-[min(32vh,18rem)] min-h-[6rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-relaxed text-neutral-800 scrollbar-dialog dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
          {configText}
        </pre>
      </DetailRow>
      <DetailRow label="Created">{formatAgentTimestamp(agent.createdAt)}</DetailRow>
      <DetailRow label="Updated">{formatAgentTimestamp(agent.updatedAt)}</DetailRow>
    </dl>
  );
}
