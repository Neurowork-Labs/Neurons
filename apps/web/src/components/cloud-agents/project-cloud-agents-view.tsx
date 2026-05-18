/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useState } from 'react';
import { Copy, Link2, Plug, RefreshCw, Search, Unlink2, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CloudAgentReadonlyDetail } from '@/components/cloud-agents/cloud-agent-readonly-detail';
import {
  ALL_CONNECTION_STATES_FILTER_VALUE,
  CONNECTED_ONLY_FILTER_VALUE,
} from '@/lib/cloud-agents/cloud-agents-types';
import { copyToClipboardWithToast } from '@/lib/cloud-agents/copy-to-clipboard-with-toast';
import {
  cloudAgentVersionTagClassName,
  formatAgentVersionForCard,
} from '@/lib/cloud-agents/cloud-agent-version-tag';
import { useProjectCloudAgentsPage } from '@/lib/cloud-agents/cloud-agents-page-logic';
import {
  connectPublicAgentToProjectViaApi,
  disconnectProjectAgentViaApi,
} from '@/lib/projects/connect-public-agent-api-client';
import { primaryCtaDialogButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

type ProjectCloudAgentsViewProps = {
  projectId: string;
};

export function ProjectCloudAgentsView({ projectId }: ProjectCloudAgentsViewProps) {
  const {
    filteredAgents,
    loadError,
    loading,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    typeFilterOptions,
    connectionFilter,
    setConnectionFilter,
    connectionFilterOptions,
    projectName,
    isAgentConnected,
    markAgentConnected,
    markAgentDisconnected,
    onRefresh,
    dialogAgent,
    setDialogAgent,
    closeAgentDialog,
    agents,
  } = useProjectCloudAgentsPage(projectId);

  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnectNameInput, setDisconnectNameInput] = useState('');
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function handleConnectAgent() {
    if (!dialogAgent) return;
    setIsConnecting(true);
    try {
      const res = await connectPublicAgentToProjectViaApi(projectId, dialogAgent.id);
      if (res.ok) {
        const targetProjectName = projectName.trim() || 'this project';
        const connectedAgentName = dialogAgent.displayName.trim() || dialogAgent.name;
        toast.success(`${connectedAgentName} connected to ${targetProjectName}`);
        markAgentConnected(dialogAgent.id);
        if (connectionFilter === CONNECTED_ONLY_FILTER_VALUE) void onRefresh();
        closeAgentDialog();
      } else {
        toast.error(res.message || 'Could not connect agent');
      }
    } finally {
      setIsConnecting(false);
    }
  }

  function resetDisconnectConfirmState() {
    setDisconnectConfirmOpen(false);
    setDisconnectNameInput('');
  }

  const dialogAgentConnected =
    dialogAgent != null ? isAgentConnected(dialogAgent.id) : false;

  async function handleDisconnectAgent() {
    if (!dialogAgent) return;
    const expectedName = dialogAgent.name.trim();
    if (disconnectNameInput.trim() !== expectedName) {
      toast.error('Please enter the agent name to disconnect.');
      return;
    }
    setIsDisconnecting(true);
    try {
      const res = await disconnectProjectAgentViaApi(projectId, dialogAgent.id);
      if (res.ok) {
        const targetProjectName = projectName.trim() || 'this project';
        toast.success(`Agent disconnected from ${targetProjectName}`);
        markAgentDisconnected(dialogAgent.id);
        if (connectionFilter !== ALL_CONNECTION_STATES_FILTER_VALUE) {
          void onRefresh();
        }
        resetDisconnectConfirmState();
        closeAgentDialog();
      } else {
        toast.error(res.message || 'Could not disconnect agent');
      }
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <>
      <ProjectTabShell
        title="Agents Cloud"
        fullWidthTabContent
        matchOrganizationMainPadding
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agent name"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search cloud agents by name"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={setTypeFilter}
            disabled={loading && agents.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[11rem] sm:shrink-0"
            >
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {typeFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={connectionFilter}
            onValueChange={setConnectionFilter}
            disabled={loading && agents.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[12rem] sm:shrink-0"
            >
              <SelectValue placeholder="All connections" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {connectionFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh cloud agents"
          >
            <RefreshCw
              className={cn('h-4 w-4', loading ? 'animate-spin' : '')}
              aria-hidden
            />
          </button>
        </div>

        {loadError ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        <div
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          role="list"
        >
          {!loading && !loadError && filteredAgents.length === 0 ? (
            <p
              className="col-span-full py-10 text-center text-sm text-neutral-600 dark:text-neutral-400"
              role="status"
            >
              {agents.length === 0
                ? 'No public cloud agents are available yet.'
                : 'No agents match your search or type filter.'}
            </p>
          ) : null}

          {!loading && !loadError
            ? filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  role="listitem"
                  onClick={() => {
                    resetDisconnectConfirmState();
                    setDialogAgent(agent);
                  }}
                  className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 text-left outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:focus-visible:ring-neutral-500 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
                        isAgentConnected(agent.id)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
                      )}
                    >
                      {isAgentConnected(agent.id) ? (
                        <Plug className="h-6 w-6" aria-hidden />
                      ) : (
                        <Unplug className="h-6 w-6" aria-hidden />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-semibold text-neutral-900 transition-colors group-hover:text-neutral-950 dark:text-neutral-50 dark:group-hover:text-white">
                          {agent.displayName}
                        </p>
                        <span
                          className={cloudAgentVersionTagClassName()}
                          title={`Version ${agent.version}`}
                        >
                          {formatAgentVersionForCard(agent.version)}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-300"
                        title={agent.name}
                      >
                        {agent.name}
                      </p>
                      {agent.description?.trim() ? (
                        <p className="mt-2 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                          {agent.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            : null}
        </div>
      </ProjectTabShell>

      <Dialog
        open={dialogAgent != null}
        onOpenChange={(open) => {
          if (!open) {
            resetDisconnectConfirmState();
            closeAgentDialog();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-plus-jakarta-sans flex max-h-[min(76vh,700px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-[84rem]"
        >
          <div className="scrollbar-dialog min-h-0 flex-1 overflow-y-auto pr-1">
            <DialogHeader className="pr-12">
              <DialogTitle className="text-neutral-900 dark:text-neutral-50">
                {dialogAgent?.displayName ?? 'Cloud agent'}
              </DialogTitle>
              {dialogAgent ? (
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-700">
                  <div className="flex min-w-0 max-w-full items-center gap-1.5">
                    <span
                      className="min-w-0 shrink truncate font-mono text-sm text-neutral-700 dark:text-neutral-300"
                      title={dialogAgent.name}
                    >
                      {dialogAgent.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyToClipboardWithToast(dialogAgent.name, {
                          successMessage: 'Agent name copied',
                        })
                      }
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      aria-label="Copy agent name"
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </DialogHeader>
            {dialogAgent ? (
              <div className="mt-4">
                <CloudAgentReadonlyDetail agent={dialogAgent} />
              </div>
            ) : null}
          </div>
          {dialogAgent ? (
            <DialogFooter className="mt-4 shrink-0 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-between">
              {dialogAgentConnected ? (
                <div className="w-full space-y-2 sm:max-w-2xl">
                  {disconnectConfirmOpen ? (
                    <>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">
                        Confirm disconnect by entering the agent name:
                        <span className="ml-1 font-mono text-xs">{dialogAgent.name}</span>
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          value={disconnectNameInput}
                          onChange={(e) => setDisconnectNameInput(e.target.value)}
                          placeholder="Enter agent name"
                          className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={resetDisconnectConfirmState}
                          className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDisconnecting}
                          onClick={() => void handleDisconnectAgent()}
                          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                        >
                          <Unlink2 className="h-4 w-4 shrink-0" aria-hidden />
                          {isDisconnecting ? 'Disconnecting…' : 'Confirm'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDisconnectConfirmOpen(true)}
                      className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                    >
                      <Unlink2 className="h-4 w-4 shrink-0" aria-hidden />
                      Disconnect
                    </button>
                  )}
                </div>
              ) : (
                <div />
              )}
              {!dialogAgentConnected ? (
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => void handleConnectAgent()}
                  className={cn(
                    primaryCtaDialogButtonClassName,
                    'inline-flex items-center justify-center gap-2',
                  )}
                >
                  <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                  {isConnecting ? 'Connecting…' : 'Connect'}
                </button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
