'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { EllipsisVertical, MessagesSquare } from 'lucide-react';

import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import {
  PROJECT_ANALYTICS_PAGE_SIZE,
  useProjectAnalyticsPage,
} from '@/lib/project-analytics/project-analytics-logic';
import type { ProjectAnalyticsVisitorLocation } from '@/lib/project-analytics/project-analytics-types';
import { cn } from '@/lib/utils';

type ProjectAnalyticsViewProps = {
  projectId: string;
};

function formatLocationDisplay(location: ProjectAnalyticsVisitorLocation): string | null {
  if (!location) return null;
  const parts = [location.city, location.state, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatLocationTooltip(location: ProjectAnalyticsVisitorLocation): string {
  if (!location) return '—';
  return `Latitude: ${location.latitude}, Longitude: ${location.longitude}`;
}

const analyticsTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_minmax(8rem,.95fr)_minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(5rem,.6fr)] sm:gap-4';

const analyticsRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_minmax(8rem,.95fr)_minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(5rem,.6fr)] sm:gap-4 sm:items-center';

function renderInlineMarkdown(text: string, strongClassName: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*)/g;
  const parts = text.split(pattern);

  for (const [index, part] of parts.entries()) {
    if (!part) continue;
    const isBold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    if (isBold) {
      nodes.push(
        <strong key={`b-${index}`} className={strongClassName}>
          {part.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<Fragment key={`t-${index}`}>{part}</Fragment>);
    }
  }

  return nodes;
}

function MessageMarkdown({
  content,
  tone = 'default',
}: {
  content: string;
  tone?: 'default' | 'emerald';
}) {
  const strongClassName =
    tone === 'emerald'
      ? 'font-semibold text-emerald-950 dark:text-white'
      : 'font-semibold text-neutral-900 dark:text-neutral-50';
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];

  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="mb-2 last:mb-0">
        {renderInlineMarkdown(paragraphBuffer.join(' '), strongClassName)}
      </p>,
    );
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
        {listBuffer.map((item, index) => (
          <li key={`li-${index}`}>{renderInlineMarkdown(item, strongClassName)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('* ') || line.startsWith('- ')) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  if (blocks.length === 0) {
    return (
      <p
        className={cn(
          'mb-0',
          tone === 'emerald' ? 'text-emerald-950/80 dark:text-white/85' : undefined,
        )}
      >
        —
      </p>
    );
  }

  return <>{blocks}</>;
}

export function ProjectAnalyticsView({ projectId }: ProjectAnalyticsViewProps) {
  const [activeActionMenuVisitorId, setActiveActionMenuVisitorId] = useState<string | null>(null);

  const {
    loading,
    loadError,
    visitorsLoading,
    visitorsError,
    search,
    setSearch,
    selectedAgentId,
    setSelectedAgentId,
    page,
    setPage,
    totalPages,
    totalVisitors,
    connectedAgentOptions,
    paginatedVisitors,
    activeVisitor,
    conversationLoading,
    conversationError,
    conversationMessages,
    hasConnectedAgents,
    hasAgentSelected,
    openVisitorConversation,
    closeVisitorConversation,
    onRefresh,
  } = useProjectAnalyticsPage(projectId);

  const visitorDisplayName =
    activeVisitor?.name?.trim() ||
    activeVisitor?.email?.trim() ||
    activeVisitor?.phone?.trim() ||
    'Visitor';
  const visitorTitleName = activeVisitor?.name?.trim() || 'Visitor';
  const dialogTitle = useMemo(() => `${visitorTitleName}'s conversation`, [visitorTitleName]);

  return (
    <ProjectTabShell title="Analytics" fullWidthTabContent matchOrganizationMainPadding>
      <div className="flex flex-col gap-5">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by anything"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search analytics"
            />
          </div>
          <Select
            value={selectedAgentId}
            onValueChange={setSelectedAgentId}
            disabled={loading && connectedAgentOptions.length <= 1}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[14rem] sm:shrink-0"
            >
              <SelectValue placeholder="All connected agents" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {connectedAgentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={loading || visitorsLoading}
            onClick={() => void onRefresh()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh analytics data"
          >
            <RefreshCw
              className={cn('h-4 w-4', loading || visitorsLoading ? 'animate-spin' : '')}
              aria-hidden
            />
          </button>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError && !hasConnectedAgents ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            Connect an agent to the current project first to view analytics visitors.
          </p>
        ) : null}

        {!loading && !loadError && hasConnectedAgents && !hasAgentSelected ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Select a connected agent to view visitor analytics.
          </p>
        ) : null}

        {hasAgentSelected ? (
          <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className={analyticsTableGridClassName}>
              <div>Visitor name</div>
              <div>Visitor email</div>
              <div>Visitor phone</div>
              <div>Location</div>
              <div>First message</div>
              <div>Last message</div>
              <div className="text-right sm:text-center">Action</div>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {visitorsError ? (
                <div className="px-4 py-10 text-center text-sm text-red-700 dark:text-red-300">
                  {visitorsError}
                </div>
              ) : visitorsLoading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Loading visitors' information...
                </div>
              ) : paginatedVisitors.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
                  No visitors found for this connected agent.
                </div>
              ) : (
                paginatedVisitors.map((visitor) => (
                  <div key={visitor.id} className={analyticsRowGridClassName}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900 dark:text-neutral-50" title={visitor.name ?? '—'}>
                        {visitor.name?.trim() || '—'}
                      </p>
                    </div>
                    <div className="truncate text-neutral-700 dark:text-neutral-200" title={visitor.email ?? '—'}>
                      {visitor.email?.trim() || '—'}
                    </div>
                    <div className="truncate text-neutral-700 dark:text-neutral-200" title={visitor.phone ?? '—'}>
                      {visitor.phone?.trim() || '—'}
                    </div>
                    <div
                      className="truncate text-neutral-700 dark:text-neutral-200 cursor-default"
                      title={formatLocationTooltip(visitor.location)}
                    >
                      {formatLocationDisplay(visitor.location) ?? '—'}
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200" title={visitor.firstMessageAt ?? '—'}>
                      {visitor.firstMessageAt ? formatAgentTimestamp(visitor.firstMessageAt) : '—'}
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200" title={visitor.lastMessageAt ?? '—'}>
                      {visitor.lastMessageAt ? formatAgentTimestamp(visitor.lastMessageAt) : '—'}
                    </div>
                    <div className="flex justify-end sm:justify-center">
                      <Popover
                        open={activeActionMenuVisitorId === visitor.id}
                        onOpenChange={(open) => setActiveActionMenuVisitorId(open ? visitor.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            aria-label="Open visitor actions"
                          >
                            <EllipsisVertical className="h-4 w-4" aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          side="bottom"
                          sideOffset={4}
                          className="w-48 min-w-[10.5rem] p-1 font-dm-sans shadow-lg z-[200]"
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <button
                            type="button"
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            onClick={() => {
                              setActiveActionMenuVisitorId(null);
                              void openVisitorConversation(visitor);
                            }}
                          >
                            <MessagesSquare className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Open conversation
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {hasAgentSelected && !visitorsLoading && totalVisitors > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing {(page - 1) * PROJECT_ANALYTICS_PAGE_SIZE + 1}-
              {Math.min(page * PROJECT_ANALYTICS_PAGE_SIZE, totalVisitors)} of {totalVisitors}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Previous
              </button>
              <span className="text-xs text-neutral-600 dark:text-neutral-300">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={activeVisitor != null} onOpenChange={(open) => {
        if (!open) closeVisitorConversation();
      }}>
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex h-[min(80vh,760px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-4xl"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700" />

          <div className="scrollbar-dialog min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {conversationError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {conversationError}
              </p>
            ) : conversationLoading ? (
              <p className="px-1 py-4 text-sm text-neutral-500 dark:text-neutral-400">Loading conversation…</p>
            ) : conversationMessages.length === 0 ? (
              <p className="px-1 py-4 text-sm text-neutral-500 dark:text-neutral-400">No messages available.</p>
            ) : (
              conversationMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-xl p-3',
                    message.role === 'agent'
                      ? 'border border-transparent bg-transparent'
                      : cn(
                          'ml-10 sm:ml-32 rounded-xl border border-emerald-900/50 bg-emerald-500/15 dark:border-emerald-600 dark:bg-emerald-500/20',
                        ),
                  )}
                >
                  <div
                    className={cn(
                      'mb-2 flex items-center gap-2 text-xs',
                      message.role === 'agent'
                        ? 'text-emerald-900 dark:text-emerald-100'
                        : 'text-emerald-900 dark:text-emerald-100',
                    )}
                  >
                    <span className="font-semibold uppercase tracking-wide">
                      {message.role === 'agent' ? 'Agent' : visitorDisplayName}
                    </span>
                    <span aria-hidden>&bull;</span>
                    <span>
                      {message.createdAt ? formatAgentTimestamp(message.createdAt) : '—'}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'break-words text-sm leading-relaxed',
                      message.role === 'agent'
                        ? 'text-neutral-800 dark:text-neutral-100'
                        : 'text-emerald-950 dark:text-neutral-50',
                    )}
                  >
                    <MessageMarkdown
                      content={message.content || ''}
                      tone={message.role === 'agent' ? 'default' : 'emerald'}
                    />
                  </div>
                  {message.role === 'agent' && message.suggestions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion, index) => (
                        <span
                          key={`${message.id}-suggestion-${index}`}
                          className="inline-flex items-center rounded-full border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                          title="Read-only suggestion"
                        >
                          {suggestion}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProjectTabShell>
  );
}
